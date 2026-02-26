---
name: local-image-gen
description: Generate images locally using Stable Diffusion via the diffusers library. Use when the user asks to generate an image, create a picture, make an illustration, produce artwork, or any text-to-image request. Triggers on phrases like "generate an image of...", "create a picture of...", "make an illustration of...", "draw me a...", "generate image", "text to image", or "stable diffusion".
---

# Local Image Generation (Stable Diffusion)

Generate images from text prompts using Stable Diffusion running locally via the HuggingFace `diffusers` library.

## Prerequisites

Ensure dependencies are installed before running:

```bash
pip install diffusers transformers accelerate torch pillow
```

For GPU acceleration (recommended): install PyTorch with CUDA support from https://pytorch.org

## Script

The generation script is at: `scripts/generate_image.py` (relative to this skill directory).

## Workflow

1. Extract the user's image description as the `--prompt` value.
2. Craft a `--negative` prompt to exclude common artifacts: `"blurry, low quality, distorted, deformed, ugly, bad anatomy"`.
3. Choose appropriate dimensions based on the request:
   - Square: `--width 512 --height 512` (default, fastest)
   - Landscape: `--width 768 --height 512`
   - Portrait: `--width 512 --height 768`
   - High-res: `--width 768 --height 768` (slower, needs more VRAM)
4. Run the script via Bash tool:

```bash
python <skill-dir>/scripts/generate_image.py \
  --prompt "the user's prompt" \
  --negative "blurry, low quality, distorted" \
  --output ./generated_image.png \
  --steps 30 \
  --guidance 7.5 \
  --half \
  --scheduler euler_a
```

5. Show the generated image to the user with the Read tool.

## Parameters

| Parameter     | Default                            | Notes                                        |
| ------------- | ---------------------------------- | -------------------------------------------- |
| `--prompt`    | (required)                         | Detailed description produces better results |
| `--output`    | `generated_image.png`              | Save path for the output image               |
| `--model`     | `stabilityai/stable-diffusion-2-1` | Any HF diffusion model ID works              |
| `--steps`     | `30`                               | 20-50 range. Higher = better quality, slower |
| `--guidance`  | `7.5`                              | 5-15 range. Higher = more prompt adherence   |
| `--negative`  | none                               | Exclude unwanted elements                    |
| `--seed`      | random                             | Set for reproducible results                 |
| `--scheduler` | `euler_a`                          | Options: euler_a, euler, dpm, ddim, pndm     |
| `--half`      | off                                | Use float16 - saves VRAM on GPU              |
| `--batch`     | `1`                                | Generate multiple variations at once         |
| `--device`    | `auto`                             | auto detects cuda > mps > cpu                |

## Prompt Engineering Tips

Enhance user prompts by appending quality boosters when appropriate:

- Photography: `"professional photography, 8k, sharp focus, detailed"`
- Art: `"digital art, trending on artstation, highly detailed"`
- Realistic: `"photorealistic, hyperrealistic, ultra detailed"`

## Common Models

| Model                                      | Best For                                |
| ------------------------------------------ | --------------------------------------- |
| `stabilityai/stable-diffusion-2-1`         | General purpose (default)               |
| `stabilityai/stable-diffusion-xl-base-1.0` | Higher quality, needs more VRAM         |
| `runwayml/stable-diffusion-v1-5`           | Lighter, faster, good community support |

## Error Handling

- **Missing dependencies**: Print install command and exit
- **CUDA out of memory**: Suggest `--half` flag or smaller dimensions
- **Model download fails**: Check internet connection and HF access
