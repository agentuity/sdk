#!/usr/bin/env bash
# adapted from https://raw.githubusercontent.com/sst/opencode/refs/heads/dev/install
# licensed under the same MIT license
set -euo pipefail
APP=agentuity

MUTED='\033[0;2m'
RED='\033[0;31m'
CYAN='\033[38;2;0;139;139m'
NC='\033[0m' # No Color

requested_version=${VERSION:-}
force_install=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      force_install=true
      shift
      ;;
    --version)
      requested_version="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Check prerequisites
if ! command -v curl >/dev/null 2>&1; then
  echo -e "${RED}Error: curl is required but not installed${NC}"
  exit 1
fi

raw_os=$(uname -s)
os=$(echo "$raw_os" | tr '[:upper:]' '[:lower:]')
case "$raw_os" in
Darwin*) os="darwin" ;;
Linux*) os="linux" ;;
MINGW* | MSYS* | CYGWIN*)
  echo -e "${RED}Windows is not directly supported. Please use WSL (Windows Subsystem for Linux)${NC}"
  exit 1
  ;;
esac

arch=$(uname -m)
if [[ "$arch" == "aarch64" ]]; then
  arch="arm64"
fi
if [[ "$arch" == "x86_64" ]]; then
  arch="x64"
fi

if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
  rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
  if [ "$rosetta_flag" = "1" ]; then
    arch="arm64"
  fi
fi

combo="$os-$arch"
case "$combo" in
linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64) ;;
*)
  echo -e "${RED}Unsupported OS/Arch: $os/$arch${NC}"
  exit 1
  ;;
esac

archive_ext=

is_musl=false
if [ "$os" = "linux" ]; then
  if [ -f /etc/alpine-release ]; then
    is_musl=true
  fi

  if command -v ldd >/dev/null 2>&1; then
    if ldd --version 2>&1 | grep -qi musl; then
      is_musl=true
    fi
  fi
fi

needs_baseline=false
if [ "$arch" = "x64" ]; then
  if [ "$os" = "linux" ]; then
    if ! grep -qi avx2 /proc/cpuinfo 2>/dev/null; then
      needs_baseline=true
    fi
  fi

  if [ "$os" = "darwin" ]; then
    avx2=$(sysctl -n hw.optional.avx2_0 2>/dev/null || echo 0)
    if [ "$avx2" != "1" ]; then
      needs_baseline=true
    fi
  fi
fi

target="$os-$arch"
if [ "$needs_baseline" = "true" ]; then
  target="$target-baseline"
fi
if [ "$is_musl" = "true" ]; then
  target="$target-musl"
fi

filename="$APP-$target$archive_ext"

curl_headers="X:Y"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  curl_headers="Authorization: Bearer $GITHUB_TOKEN"
fi


INSTALL_DIR=$HOME/.agentuity/bin
if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
  echo -e "${RED}Error: Failed to create installation directory: $INSTALL_DIR${NC}"
  echo -e "${RED}Please check permissions and try again${NC}"
  exit 1
fi

if [ ! -w "$INSTALL_DIR" ]; then
  echo -e "${RED}Error: Installation directory is not writable: $INSTALL_DIR${NC}"
  echo -e "${RED}Please check permissions and try again${NC}"
  exit 1
fi

if [ -z "$requested_version" ]; then
  url="https://github.com/agentuity/sdk/releases/latest/download/$filename"
  specific_version=$(curl -s https://api.github.com/repos/agentuity/sdk/releases/latest -H "$curl_headers" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')

  if [[ $? -ne 0 || -z "$specific_version" ]]; then
    echo -e "${RED}Failed to fetch version information${NC}"
    exit 1
  fi
else
  url="https://github.com/agentuity/sdk/releases/download/v${requested_version}/$filename"
  specific_version=$requested_version
fi

print_message() {
  local level=$1
  local message=$2
  local color=""

  case $level in
  info) color="${NC}" ;;
  warning) color="${NC}" ;;
  error) color="${RED}" ;;
  debug) color="${MUTED}" ;;
  esac

  echo -e "${color}${message}${NC}"
}

check_version() {
  if command -v agentuity >/dev/null 2>&1; then
    agentuity_path=$(which agentuity)
    installed_version=$(agentuity version 2>/dev/null || echo "unknown")

    if [[ "$installed_version" != "$specific_version" ]]; then
      print_message info "${MUTED}Installed version: ${NC}$installed_version."
    else
      if [ "$force_install" = false ]; then
        print_message info "${MUTED}Version ${NC}$specific_version${MUTED} already installed"
        exit 0
      else
        print_message info "${MUTED}Force reinstalling version ${NC}$specific_version"
      fi
    fi
  fi
}

unbuffered_sed() {
  if echo | sed -u -e "" >/dev/null 2>&1; then
    sed -nu "$@"
  elif echo | sed -l -e "" >/dev/null 2>&1; then
    sed -nl "$@"
  else
    local pad="$(printf "\n%512s" "")"
    sed -ne "s/$/\\${pad}/" "$@"
  fi
}

print_progress() {
  local bytes="$1"
  local length="$2"
  [ "$length" -gt 0 ] || return 0

  local width=50
  local percent=$((bytes * 100 / length))
  [ "$percent" -gt 100 ] && percent=100
  local on=$((percent * width / 100))
  local off=$((width - on))

  local filled=$(printf "%*s" "$on" "")
  filled=${filled// /■}
  local empty=$(printf "%*s" "$off" "")
  empty=${empty// /･}

  printf "\r${CYAN}%s%s %3d%%${NC}" "$filled" "$empty" "$percent" >&4
}

download_with_progress() {
  local url="$1"
  local output="$2"
  local headers="$3"

  if [ -t 2 ]; then
    exec 4>&2
  else
    exec 4>/dev/null
  fi

  local tmp_dir=${TMPDIR:-/tmp}
  local basename="${tmp_dir}/agentuity_install_$$"
  local tracefile="${basename}.trace"

  rm -f "$tracefile"
  
  # Check if mkfifo is available and working
  if ! command -v mkfifo >/dev/null 2>&1 || ! mkfifo "$tracefile" 2>/dev/null; then
    # Fallback to simple download without progress
    exec 4>&-
    return 1
  fi

  # Hide cursor
  printf "\033[?25l" >&4

  trap "trap - RETURN; rm -f \"$tracefile\"; printf '\033[?25h' >&4; exec 4>&-" RETURN

  (
    curl --trace-ascii "$tracefile" -s -L -o "$output" -H "$headers" "$url"
  ) &
  local curl_pid=$!

  unbuffered_sed \
    -e 'y/ACDEGHLNORTV/acdeghlnortv/' \
    -e '/^0000: content-length:/p' \
    -e '/^<= recv data/p' \
    "$tracefile" |
    {
      local length=0
      local bytes=0

      while IFS=" " read -r -a line; do
        [ "${#line[@]}" -lt 2 ] && continue
        local tag="${line[0]} ${line[1]}"

        if [ "$tag" = "0000: content-length:" ]; then
          length="${line[2]}"
          length=$(echo "$length" | tr -d '\r')
          bytes=0
        elif [ "$tag" = "<= recv" ]; then
          local size="${line[3]}"
          bytes=$((bytes + size))
          if [ "$length" -gt 0 ]; then
            print_progress "$bytes" "$length"
          fi
        fi
      done
    }

  wait $curl_pid
  local ret=$?
  echo "" >&4
  return $ret
}

download_and_install() {
  print_message info "\n${MUTED}Installing ${NC}agentuity ${MUTED}version: ${NC}$specific_version"
  tmpdir=$(mktemp -d 2>/dev/null || mktemp -d -t tmp)
  
  # Ensure cleanup on exit
  trap 'cd / 2>/dev/null; rm -rf "$tmpdir"' EXIT
  
  cd "$tmpdir"

  if ! download_with_progress "$url" "$filename" "$curl_headers"; then
    # Fallback to standard curl on Windows or if custom progress fails
    if ! curl -# -L -o "$filename" -H "$curl_headers" "$url"; then
      print_message error "Failed to download $filename from $url"
      exit 1
    fi
  fi
  
  if [ ! -f "$filename" ]; then
    print_message error "Download failed - file not found: $filename"
    exit 1
  fi

  cp "$filename" "$INSTALL_DIR/agentuity"
  chmod 755 "${INSTALL_DIR}/agentuity"
  cd /
  rm -rf "$tmpdir"
  trap - EXIT
}

if [ "$force_install" = false ]; then
  check_version
fi
download_and_install

add_to_path() {
  local config_file=$1
  local command=$2

  if grep -Fxq "$command" "$config_file"; then
    print_message debug "Command already exists in $config_file, skipping write."
  elif [[ -w $config_file ]]; then
    echo -e "\n# agentuity" >>"$config_file"
    echo "$command" >>"$config_file"
    print_message info "${MUTED}Successfully added ${NC}agentuity ${MUTED}to \$PATH in ${NC}$config_file"
  else
    print_message warning "Manually add the directory to $config_file (or similar):"
    print_message info "  $command"
  fi
}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}

current_shell=$(basename "$SHELL")
case $current_shell in
fish)
  config_files="$HOME/.config/fish/config.fish"
  ;;
zsh)
  config_files="$HOME/.zshrc $HOME/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv"
  ;;
bash)
  config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
  ;;
ash)
  config_files="$HOME/.ashrc $HOME/.profile /etc/profile"
  ;;
sh)
  config_files="$HOME/.ashrc $HOME/.profile /etc/profile"
  ;;
*)
  # Default case if none of the above matches
  config_files="$HOME/.bashrc $HOME/.bash_profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
  ;;
esac

config_file=""
for file in $config_files; do
  if [[ -f $file ]]; then
    config_file=$file
    break
  fi
done

if [[ -z $config_file ]]; then
  print_message error "No config file found for $current_shell. Checked files: $config_files"
  exit 1
fi

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  case $current_shell in
  fish)
    add_to_path "$config_file" "fish_add_path $INSTALL_DIR"
    ;;
  zsh)
    add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
    ;;
  bash)
    add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
    ;;
  ash)
    add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
    ;;
  sh)
    add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
    ;;
  *)
    export PATH=$INSTALL_DIR:$PATH
    print_message warning "Manually add the directory to $config_file (or similar):"
    print_message info "  export PATH=$INSTALL_DIR:\$PATH"
    ;;
  esac
fi

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" == "true" ]; then
  echo "$INSTALL_DIR" >>$GITHUB_PATH
  print_message info "Added $INSTALL_DIR to \$GITHUB_PATH"
fi

echo -e ""
echo -e "${CYAN}╭────────────────────────────────────────────────────╮${NC}"
echo -e "${CYAN}│${NC} ⨺ Agentuity  The full-stack platform for AI agents ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}                                                    ${CYAN}│${NC}"
echo -e "${CYAN}│${NC} Version:        ${specific_version}$(printf '%*s' $((35 - ${#specific_version})) '')${CYAN}│${NC}"
echo -e "${CYAN}│${NC} Docs:           https://agentuity.dev              ${CYAN}│${NC}"
echo -e "${CYAN}│${NC} Community:      https://discord.gg/agentuity       ${CYAN}│${NC}"
echo -e "${CYAN}│${NC} Dashboard:      https://app.agentuity.com          ${CYAN}│${NC}"
echo -e "${CYAN}╰────────────────────────────────────────────────────╯${NC}"
echo -e ""
echo -e "${MUTED}To get started, run:${NC}"
echo -e ""
echo -e "agentuity create       ${MUTED}Create a project${NC}"
echo -e "agentuity login        ${MUTED}Login to an existing account${NC}"
echo -e "agentuity help         ${MUTED}List commands and options${NC}"
echo -e ""
