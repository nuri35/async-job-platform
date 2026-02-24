"""Scan NestJS controller files and extract endpoint information."""

import json
import re
import sys
from pathlib import Path
from typing import Optional


def scan_controller(file_path: str) -> dict:
    """Parse a NestJS controller file and extract endpoint metadata.

    Args:
        file_path: Path to the controller .ts file.

    Returns:
        Dictionary with controller name, path, guards, and endpoint details.
    """
    path = Path(file_path)

    if not path.exists():
        return {"error": f"File not found: {file_path}"}

    if not path.suffix == ".ts":
        return {"error": f"Not a TypeScript file: {file_path}"}

    content = path.read_text(encoding="utf-8")

    result = {
        "file": str(path),
        "controller": extract_controller_name(content),
        "path": extract_controller_path(content),
        "guards": extract_class_guards(content),
        "has_swagger_tags": "@ApiTags" in content,
        "has_bearer_auth": "@ApiBearerAuth" in content,
        "existing_imports": extract_swagger_imports(content),
        "endpoints": extract_endpoints(content),
    }

    return result


def extract_controller_name(content: str) -> Optional[str]:
    """Extract the controller class name."""
    match = re.search(r"export\s+class\s+(\w+Controller)", content)
    return match.group(1) if match else None


def extract_controller_path(content: str) -> Optional[str]:
    """Extract the controller route path from @Controller decorator."""
    match = re.search(r"@Controller\(['\"]([^'\"]*)['\"]", content)
    return match.group(1) if match else ""


def extract_class_guards(content: str) -> list[str]:
    """Extract guards applied at controller class level."""
    guards = []
    # Find guards before the class declaration
    class_match = re.search(r"export\s+class", content)
    if not class_match:
        return guards

    before_class = content[: class_match.start()]
    guard_matches = re.findall(r"@UseGuards\(([^)]+)\)", before_class)

    for match in guard_matches:
        guard_names = [g.strip() for g in match.split(",")]
        guards.extend(guard_names)

    return guards


def extract_swagger_imports(content: str) -> list[str]:
    """Extract existing Swagger imports."""
    imports = []
    swagger_import_match = re.search(
        r"import\s*\{([^}]+)\}\s*from\s*['\"]@nestjs/swagger['\"]", content
    )
    if swagger_import_match:
        import_names = swagger_import_match.group(1)
        imports = [name.strip() for name in import_names.split(",") if name.strip()]
    return imports


def extract_endpoints(content: str) -> list[dict]:
    """Extract all endpoint methods with their metadata."""
    endpoints = []

    http_methods = ["Get", "Post", "Put", "Patch", "Delete"]
    pattern = "|".join(rf"@{m}" for m in http_methods)

    lines = content.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Check if line has an HTTP method decorator
        method_match = re.search(rf"@({('|'.join(http_methods))})\(([^)]*)\)", line)

        if method_match:
            http_method = method_match.group(1).upper()
            endpoint_path = method_match.group(2).strip("'\"") if method_match.group(2) else ""

            # Look backwards for guards and existing swagger decorators
            guards = []
            has_api_operation = False
            has_api_response = False
            has_api_body = False

            for back in range(max(0, i - 10), i):
                back_line = lines[back].strip()
                if "@UseGuards(" in back_line:
                    guard_match = re.search(r"@UseGuards\(([^)]+)\)", back_line)
                    if guard_match:
                        guards = [g.strip() for g in guard_match.group(1).split(",")]
                if "@ApiOperation" in back_line:
                    has_api_operation = True
                if "@ApiResponse" in back_line:
                    has_api_response = True
                if "@ApiBody" in back_line:
                    has_api_body = True

            # Look forward for the method signature
            func_name = None
            parameters = []

            for forward in range(i + 1, min(i + 5, len(lines))):
                forward_line = lines[forward].strip()
                func_match = re.search(r"async\s+(\w+)\(([^)]*)\)", forward_line)
                if not func_match:
                    func_match = re.search(r"(\w+)\(([^)]*)\)", forward_line)

                if func_match:
                    func_name = func_match.group(1)
                    params_str = func_match.group(2)
                    parameters = parse_parameters(params_str)
                    break

            # Extract return type
            return_type = None
            for forward in range(i + 1, min(i + 5, len(lines))):
                forward_line = lines[forward]
                type_match = re.search(r":\s*Promise<([^>]+)>", forward_line)
                if not type_match:
                    type_match = re.search(r":\s*(\w+(?:Dto|Response|Entity)\w*)", forward_line)
                if type_match:
                    return_type = type_match.group(1)
                    break

            endpoint = {
                "method": http_method,
                "path": endpoint_path,
                "function_name": func_name,
                "parameters": parameters,
                "return_type": return_type,
                "guards": guards,
                "has_swagger": has_api_operation or has_api_response,
                "swagger_status": {
                    "has_api_operation": has_api_operation,
                    "has_api_response": has_api_response,
                    "has_api_body": has_api_body,
                },
            }
            endpoints.append(endpoint)

        i += 1

    return endpoints


def parse_parameters(params_str: str) -> list[dict]:
    """Parse method parameters to extract decorators and types."""
    parameters = []

    if not params_str.strip():
        return parameters

    # Match patterns like @Body() dto: CreateUserDto, @Param('id') id: string
    param_patterns = [
        (r"@Body\(\)\s*(\w+)\s*:\s*(\w+)", "Body"),
        (r"@Param\(['\"](\w+)['\"]\)\s*(\w+)\s*:\s*(\w+)", "Param"),
        (r"@Query\(['\"](\w+)['\"]\)\s*(\w+)\s*:\s*(\w+)", "Query"),
        (r"@Query\(\)\s*(\w+)\s*:\s*(\w+)", "QueryObject"),
        (r"@Req\(\)\s*(\w+)", "Req"),
    ]

    for pattern, param_type in param_patterns:
        matches = re.finditer(pattern, params_str)
        for match in matches:
            if param_type == "Body":
                parameters.append({
                    "type": "Body",
                    "name": match.group(1),
                    "dto": match.group(2),
                })
            elif param_type == "Param":
                parameters.append({
                    "type": "Param",
                    "param_name": match.group(1),
                    "name": match.group(2),
                    "data_type": match.group(3),
                })
            elif param_type == "Query":
                parameters.append({
                    "type": "Query",
                    "query_name": match.group(1),
                    "name": match.group(2),
                    "data_type": match.group(3),
                })
            elif param_type == "QueryObject":
                parameters.append({
                    "type": "QueryObject",
                    "name": match.group(1),
                    "dto": match.group(2),
                })
            elif param_type == "Req":
                parameters.append({
                    "type": "Req",
                    "name": match.group(1),
                })

    return parameters


def scan_module_dtos(module_path: str) -> list[dict]:
    """Scan a module directory for DTO files and extract basic info.

    Args:
        module_path: Path to the module directory.

    Returns:
        List of DTO file summaries.
    """
    path = Path(module_path)

    if not path.exists():
        return [{"error": f"Directory not found: {module_path}"}]

    dto_files = []

    # Search for DTO files in module and subdirectories
    for dto_file in path.rglob("*.dto.ts"):
        content = dto_file.read_text(encoding="utf-8")

        classes = re.findall(r"export\s+class\s+(\w+)", content)
        has_swagger = "@ApiProperty" in content or "@ApiPropertyOptional" in content
        property_count = len(re.findall(r"^\s+\w+[\?]?\s*:", content, re.MULTILINE))

        dto_files.append({
            "file": str(dto_file),
            "classes": classes,
            "has_swagger": has_swagger,
            "property_count": property_count,
        })

    return dto_files


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Scan controller:  python scan_endpoints.py controller <file.controller.ts>")
        print("  Scan module DTOs: python scan_endpoints.py dtos <module-directory>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "controller" and len(sys.argv) >= 3:
        result = scan_controller(sys.argv[2])
        print(json.dumps(result, indent=2))

    elif command == "dtos" and len(sys.argv) >= 3:
        result = scan_module_dtos(sys.argv[2])
        print(json.dumps(result, indent=2))

    else:
        print(f"Unknown command: {command}")
        print("Use 'controller' or 'dtos'")
        sys.exit(1)
