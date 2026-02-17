#\!/bin/bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path')
if [ -n "$FILE_PATH" ] && [ "$FILE_PATH" \!= "null" ]; then
  npx prettier --write "$FILE_PATH" 2>/dev/null
fi
exit 0
