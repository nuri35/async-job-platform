"""Generate images locally using Stable Diffusion via the diffusers library.

Usage:
    python generate_image.py --prompt "a cat sitting on a rainbow" [options]

Requirements:
    pip install diffusers transformers accelerate torch pillow

Options:
    --prompt       Text description of the image to generate (required)
    --output       Output file path (default: generated_image.png)
    --model        HuggingFace model ID (default: stabilityai/stable-diffusion-2-1)
    --width        Image width in pixels (default: 512, must be multiple of 8)
    --height       Image height in pixels (default: 512, must be multiple of 8)
    --steps        Number of inference steps (default: 30, higher = better quality)
    --guidance     Guidance scale / CFG (default: 7.5, higher = closer to prompt)
    --negative     Negative prompt to exclude unwanted elements
    --seed         Random seed for reproducibility (default: random)
    --scheduler    Scheduler type: euler_a, euler, dpm, ddim, pndm (default: euler_a)
    --device       Device: auto, cpu, cuda, mps (default: auto)
    --half         Use float16 precision for lower VRAM usage (flag)
    --batch        Number of images to generate (default: 1)
"""

import argparse
import sys
import time
from pathlib import Path


def detect_device(preferred: str) -> str:
    """Detect the best available device for inference."""
    import torch

    if preferred != "auto":
        return preferred

    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_scheduler(scheduler_name: str, config):
    """Get the scheduler/sampler by name."""
    from diffusers import (
        EulerAncestralDiscreteScheduler,
        EulerDiscreteScheduler,
        DPMSolverMultistepScheduler,
        DDIMScheduler,
        PNDMScheduler,
    )

    schedulers = {
        "euler_a": EulerAncestralDiscreteScheduler,
        "euler": EulerDiscreteScheduler,
        "dpm": DPMSolverMultistepScheduler,
        "ddim": DDIMScheduler,
        "pndm": PNDMScheduler,
    }

    scheduler_cls = schedulers.get(scheduler_name)
    if scheduler_cls is None:
        print(f"Unknown scheduler '{scheduler_name}', using euler_a")
        scheduler_cls = EulerAncestralDiscreteScheduler

    return scheduler_cls.from_config(config)


def generate(args) -> list[Path]:
    """Run Stable Diffusion pipeline and save generated images."""
    import torch
    from diffusers import StableDiffusionPipeline

    device = detect_device(args.device)
    dtype = torch.float16 if args.half and device != "cpu" else torch.float32

    print(f"Loading model: {args.model}")
    print(f"Device: {device} | Precision: {dtype}")

    pipe = StableDiffusionPipeline.from_pretrained(
        args.model,
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    )

    pipe.scheduler = get_scheduler(args.scheduler, pipe.scheduler.config)
    pipe = pipe.to(device)

    # Enable memory optimizations
    if device == "cuda":
        try:
            pipe.enable_xformers_memory_efficient_attention()
            print("xformers memory efficient attention enabled")
        except Exception:
            pipe.enable_attention_slicing()
            print("Attention slicing enabled (install xformers for better perf)")
    elif device == "mps":
        pipe.enable_attention_slicing()

    # Set seed
    generator = None
    if args.seed is not None:
        generator = torch.Generator(device=device).manual_seed(args.seed)
        print(f"Seed: {args.seed}")

    print(f"Prompt: {args.prompt}")
    if args.negative:
        print(f"Negative: {args.negative}")
    print(
        f"Size: {args.width}x{args.height} | Steps: {args.steps} | CFG: {args.guidance}")
    print(f"Generating {args.batch} image(s)...")

    start = time.time()

    result = pipe(
        prompt=args.prompt,
        negative_prompt=args.negative,
        width=args.width,
        height=args.height,
        num_inference_steps=args.steps,
        guidance_scale=args.guidance,
        generator=generator,
        num_images_per_prompt=args.batch,
    )

    elapsed = time.time() - start
    print(f"Generation completed in {elapsed:.1f}s")

    # Save images
    output_path = Path(args.output)
    saved_paths = []

    for i, image in enumerate(result.images):
        if args.batch == 1:
            save_path = output_path
        else:
            save_path = output_path.parent / \
                f"{output_path.stem}_{i+1}{output_path.suffix}"

        save_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(str(save_path))
        saved_paths.append(save_path)
        print(f"Saved: {save_path}")

    return saved_paths


def main():
    parser = argparse.ArgumentParser(
        description="Generate images locally with Stable Diffusion"
    )
    parser.add_argument("--prompt", required=True,
                        help="Text prompt for image generation")
    parser.add_argument(
        "--output", default="generated_image.png", help="Output file path")
    parser.add_argument(
        "--model",
        default="stabilityai/stable-diffusion-2-1",
        help="HuggingFace model ID",
    )
    parser.add_argument("--width", type=int, default=512,
                        help="Image width (multiple of 8)")
    parser.add_argument("--height", type=int, default=512,
                        help="Image height (multiple of 8)")
    parser.add_argument("--steps", type=int, default=30,
                        help="Inference steps")
    parser.add_argument("--guidance", type=float,
                        default=7.5, help="Guidance scale (CFG)")
    parser.add_argument("--negative", default=None, help="Negative prompt")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    parser.add_argument(
        "--scheduler",
        default="euler_a",
        choices=["euler_a", "euler", "dpm", "ddim", "pndm"],
        help="Scheduler/sampler type",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cpu", "cuda", "mps"],
        help="Compute device",
    )
    parser.add_argument("--half", action="store_true",
                        help="Use float16 precision")
    parser.add_argument("--batch", type=int, default=1,
                        help="Number of images to generate")

    args = parser.parse_args()

    # Validate dimensions
    if args.width % 8 != 0 or args.height % 8 != 0:
        print("Error: width and height must be multiples of 8")
        sys.exit(1)

    try:
        generate(args)
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install with: pip install diffusers transformers accelerate torch pillow")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
