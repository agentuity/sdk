#!/bin/sh
# adapted from https://raw.githubusercontent.com/sst/opencode/refs/heads/dev/install
# licensed under the same MIT license
set -eu

MUTED='\033[0;2m'
RED='\033[0;31m'
CYAN='\033[38;2;0;139;139m'
NC='\033[0m' # No Color

requested_version=${VERSION:-}
force_install=false
non_interactive=false
path_modified=false

# Restore terminal state on exit/interrupt
cleanup_terminal() {
  # Restore cursor visibility
  printf '\033[?25h' 2>/dev/null || true
  # Reset terminal to sane state
  stty sane 2>/dev/null || true
}

# Set up global trap for terminal cleanup
trap cleanup_terminal EXIT INT TERM

# Parse command line arguments
while [ $# -gt 0 ]; do
  case $1 in
    --force)
      force_install=true
      shift
      ;;
    --version)
      requested_version="$2"
      shift 2
      ;;
    -y|--yes|--non-interactive)
      non_interactive=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Detect CI/non-interactive environments
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${GITLAB_CI:-}" ] || [ -n "${CIRCLECI:-}" ] || [ -n "${JENKINS_HOME:-}" ] || [ -n "${TRAVIS:-}" ]; then
  non_interactive=true
fi

# If stdin is not a TTY, we're non-interactive
if [ ! -t 0 ]; then
  non_interactive=true
fi

# Check prerequisites - either curl or wget
HAS_CURL=false
HAS_WGET=false
if command -v curl >/dev/null 2>&1; then
  HAS_CURL=true
elif command -v wget >/dev/null 2>&1; then
  HAS_WGET=true
else
  printf "${RED}Error: either curl or wget is required but neither is installed${NC}\n"
  exit 1
fi

raw_os=$(uname -s)
os=$(echo "$raw_os" | tr '[:upper:]' '[:lower:]')
case "$raw_os" in
Darwin*) os="darwin" ;;
Linux*) os="linux" ;;
MINGW* | MSYS* | CYGWIN*)
  printf "${RED}Windows is not directly supported. Please use WSL (Windows Subsystem for Linux)${NC}\n"
  exit 1
  ;;
esac

arch=$(uname -m)
if [ "$arch" = "aarch64" ]; then
  arch="arm64"
fi
if [ "$arch" = "x86_64" ]; then
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
  printf "${RED}Unsupported OS/Arch: $os/$arch${NC}\n"
  exit 1
  ;;
esac


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

filename="agentuity-$os-$arch"

INSTALL_DIR=$HOME/.agentuity/bin
if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
  printf "${RED}Error: Failed to create installation directory: $INSTALL_DIR${NC}\n"
  printf "${RED}Please check permissions and try again${NC}\n"
  exit 1
fi

if [ ! -w "$INSTALL_DIR" ]; then
  printf "${RED}Error: Installation directory is not writable: $INSTALL_DIR${NC}\n"
  printf "${RED}Please check permissions and try again${NC}\n"
  exit 1
fi

if [ -z "$requested_version" ]; then
  if [ "$HAS_CURL" = true ]; then
    specific_version=$(curl -s https://agentuity.sh/release/sdk/version)
  else
    specific_version=$(wget -qO- https://agentuity.sh/release/sdk/version)
  fi
  if [ $? -ne 0 ] || [ -z "$specific_version" ]; then
    printf "${RED}Failed to fetch version information${NC}\n"
    exit 1
  fi
  
  # Validate the version string format (should be vX.Y.Z or X.Y.Z)
  case "$specific_version" in
    v[0-9]*.[0-9]*.[0-9]*|[0-9]*.[0-9]*.[0-9]*)
      # Valid version format
      ;;
    *"message"*|*"error"*|*"Error"*|*"<html>"*|*"<!DOCTYPE"*)
      printf "${RED}Error: Server returned an error instead of version: $specific_version${NC}\n"
      exit 1
      ;;
    *)
      printf "${RED}Error: Invalid version format received: $specific_version${NC}\n"
      exit 1
      ;;
  esac
  
  # Normalize version to always have 'v' prefix for consistent comparisons
  case "$specific_version" in
    v*) ;;
    *) specific_version="v${specific_version}" ;;
  esac
  
  url="https://agentuity.sh/release/sdk/${specific_version}/${os}/${arch}"
else
  # Normalize user-provided version to always have 'v' prefix
  case "$requested_version" in
    v*) specific_version=$requested_version ;;
    *) specific_version="v${requested_version}" ;;
  esac
  url="https://agentuity.sh/release/sdk/${specific_version}/${os}/${arch}"
fi

print_message() {
  _pm_level=$1
  _pm_message=$2
  _pm_color=""

  case $_pm_level in
  info) _pm_color="${NC}" ;;
  warning) _pm_color="${NC}" ;;
  error) _pm_color="${RED}" ;;
  debug) _pm_color="${MUTED}" ;;
  esac

  printf "${_pm_color}${_pm_message}${NC}\n"
}

check_brew_install() {
  if command -v brew >/dev/null 2>&1; then
    if brew list agentuity >/dev/null 2>&1; then
      print_message warning "${RED}Warning: ${NC}Legacy Go-based CLI installed via Homebrew detected."
      print_message info "${MUTED}The new version uses a different installation method.${NC}"

      if [ "$non_interactive" = false ]; then
        printf "Do you want to uninstall the Homebrew version? (y/N): "
        read -r response
        case "$response" in
          [yY][eE][sS]|[yY])
            print_message info "${MUTED}Uninstalling Homebrew version...${NC}"
            if brew uninstall agentuity; then
              print_message info "${MUTED}Successfully uninstalled Homebrew version${NC}"
            else
              print_message error "Failed to uninstall Homebrew version. Please run: brew uninstall agentuity"
              exit 1
            fi
            ;;
          *)
            print_message error "Please uninstall the Homebrew version first: brew uninstall agentuity"
            exit 1
            ;;
        esac
      else
        print_message error "Please uninstall the Homebrew version first: brew uninstall agentuity"
        exit 1
      fi
    fi
  fi
}

check_bun_install() {
  if command -v agentuity >/dev/null 2>&1; then
    agentuity_path=$(which agentuity)

    # Check if the binary is in a bun global install location
    case "$agentuity_path" in
      *"/.bun/bin/"*|*"/bun/bin/"*)
        print_message warning "${RED}Warning: ${NC}Bun global installation detected at ${CYAN}$agentuity_path${NC}"
        print_message info "${MUTED}The global binary installation is recommended over bun global install.${NC}"

        if [ "$non_interactive" = false ]; then
          print_message info ""
          print_message info "To switch to the binary installation:"
          print_message info "  1. Uninstall the bun global package: ${CYAN}bun remove -g @agentuity/cli${NC}"
          print_message info "  2. Re-run this install script"
          print_message info ""
          printf "Continue anyway? (y/N): "
          read -r response
          case "$response" in
            [yY][eE][sS]|[yY])
              print_message info "${MUTED}Continuing with installation. Note: You may need to adjust your PATH.${NC}"
              ;;
            *)
              print_message info "Installation cancelled. Please uninstall the bun global package first."
              exit 0
              ;;
          esac
        else
          print_message info "${MUTED}Running in non-interactive mode. Installing anyway.${NC}"
          print_message info "${MUTED}Note: Ensure $INSTALL_DIR is in your PATH before the bun global path.${NC}"
        fi
        ;;
    esac
  fi
}

check_legacy_binaries() {
  # Legacy install script used these paths (in order of preference):
  # $HOME/.local/bin, $HOME/.bin, $HOME/bin, /usr/local/bin
  
  found_legacy=false
  legacy_locations=""

  for path in "$HOME/.local/bin/agentuity" "$HOME/.bin/agentuity" "$HOME/bin/agentuity" "/usr/local/bin/agentuity"; do
    if [ -f "$path" ] && [ "$path" != "$INSTALL_DIR/agentuity" ]; then
      found_legacy=true
      legacy_locations="$legacy_locations $path"
    fi
  done

  if [ "$found_legacy" = true ]; then
    print_message warning "${RED}Warning: ${NC}Legacy binary installation(s) detected"
    for location in $legacy_locations; do
      print_message info "  - ${CYAN}$location${NC}"
    done

    if [ "$non_interactive" = false ]; then
      printf "Remove legacy binaries? (Y/n): "
      read -r response
      case "$response" in
        [nN][oO]|[nN])
          print_message info "${MUTED}Skipping legacy binary removal. Note: You may have conflicts.${NC}"
          ;;
        *)
          for location in $legacy_locations; do
            if rm -f "$location" 2>/dev/null; then
              print_message info "${MUTED}Removed $location${NC}"
            else
              print_message warning "Could not remove $location - you may need to remove it manually"
            fi
          done
          ;;
      esac
    else
      # Non-interactive mode: auto-remove if writable
      for location in $legacy_locations; do
        if rm -f "$location" 2>/dev/null; then
          print_message info "${MUTED}Removed legacy binary: $location${NC}"
        else
          print_message warning "Could not remove $location - may require manual cleanup"
        fi
      done
    fi
  fi
}

check_version() {
  if command -v agentuity >/dev/null 2>&1; then
    agentuity_path=$(which agentuity)
    installed_version=v$(agentuity version 2>/dev/null || echo "unknown")

    if [ "$installed_version" != "$specific_version" ] && [ "$installed_version" != "unknown" ]; then
      print_message info "${MUTED}Installed version: ${NC}$installed_version."
    elif [ "$installed_version" = "$specific_version" ]; then
      if [ "$force_install" = false ]; then
        print_message info "${MUTED}Version ${NC}$specific_version${MUTED} already installed"
        exit 0
      else
        print_message info "${MUTED}Force reinstalling version ${NC}$specific_version"
      fi
    fi
  fi
}

check_musl_and_gcompat() {
  if [ "$is_musl" = true ]; then
    printf "\n"
    print_message warning "${RED}╭────────────────────────────────────────────────────────╮${NC}"
    print_message warning "${RED}│${NC}  Alpine Linux / musl is NOT currently supported     ${RED}│${NC}"
    print_message warning "${RED}╰────────────────────────────────────────────────────────╯${NC}"
    printf "\n"
    print_message info "Bun's --compile produces corrupted binaries on musl (known bug)"
    print_message info "Use a glibc distro: Ubuntu, Debian, Fedora, Amazon Linux"
    printf "\n"
    exit 1
  fi
}

unbuffered_sed() {
  if echo | sed -u -e "" >/dev/null 2>&1; then
    sed -nu "$@"
  elif echo | sed -l -e "" >/dev/null 2>&1; then
    sed -nl "$@"
  else
    _sed_pad="$(printf "\n%512s" "")"
    sed -ne "s/$/\\${_sed_pad}/" "$@"
  fi
}

print_progress() {
  _pp_bytes="$1"
  _pp_length="$2"
  [ "$_pp_length" -gt 0 ] || return 0

  _pp_width=50
  _pp_percent=$((_pp_bytes * 100 / _pp_length))
  [ "$_pp_percent" -gt 100 ] && _pp_percent=100
  _pp_on=$((_pp_percent * _pp_width / 100))
  _pp_off=$((_pp_width - _pp_on))

  _pp_filled=$(printf "%*s" "$_pp_on" "" | sed 's/ /■/g')
  _pp_empty=$(printf "%*s" "$_pp_off" "" | sed 's/ /･/g')

  printf "\r${CYAN}%s%s %3d%%${NC}" "$_pp_filled" "$_pp_empty" "$_pp_percent" >&4
}

download_with_progress() {
  _dwp_url="$1"
  _dwp_output="$2"

  if [ -t 2 ]; then
    exec 4>&2
  else
    exec 4>/dev/null
  fi

  _dwp_tmp_dir=${TMPDIR:-/tmp}
  _dwp_basename="${_dwp_tmp_dir}/agentuity_install_$$"
  _dwp_tracefile="${_dwp_basename}.trace"

  rm -f "$_dwp_tracefile"
  
  # Check if mkfifo is available and working
  if ! command -v mkfifo >/dev/null 2>&1 || ! mkfifo "$_dwp_tracefile" 2>/dev/null; then
    # Fallback to simple download without progress
    exec 4>&-
    return 1
  fi

  # Hide cursor
  printf "\033[?25l" >&4

  trap 'rm -f "$_dwp_tracefile"; printf "\033[?25h" >&4 2>/dev/null; exec 4>&- 2>/dev/null; cleanup_terminal' EXIT INT TERM

  (
    curl --trace-ascii "$_dwp_tracefile" -s -L -f -o "$_dwp_output" "$_dwp_url"
  ) &
  _dwp_curl_pid=$!

  unbuffered_sed \
    -e 'y/ACDEGHLNORTV/acdeghlnortv/' \
    -e '/^0000: content-length:/p' \
    -e '/^<= recv data/p' \
    "$_dwp_tracefile" |
    {
      _dwp_length=0
      _dwp_bytes=0

      while IFS=" " read -r _dwp_line; do
        set -- $_dwp_line
        [ $# -lt 2 ] && continue
        _dwp_tag="$1 $2"

        if [ "$_dwp_tag" = "0000: content-length:" ]; then
          _dwp_length="$3"
          _dwp_length=$(echo "$_dwp_length" | tr -d '\r')
          _dwp_bytes=0
        elif [ "$_dwp_tag" = "<= recv" ]; then
          _dwp_size="$4"
          _dwp_bytes=$((_dwp_bytes + _dwp_size))
          if [ "$_dwp_length" -gt 0 ]; then
            print_progress "$_dwp_bytes" "$_dwp_length"
          fi
        fi
      done
    }

  wait $_dwp_curl_pid
  _dwp_ret=$?
  printf "\n" >&4 2>/dev/null
  rm -f "$_dwp_tracefile"
  printf '\033[?25h' >&4 2>/dev/null
  exec 4>&- 2>/dev/null
  trap cleanup_terminal EXIT INT TERM
  return $_dwp_ret
}

download_and_install() {
  print_message info "\n${MUTED}Installing ${NC}agentuity ${MUTED}version: ${NC}$specific_version"
  tmpdir=$(mktemp -d 2>/dev/null || mktemp -d -t tmp)
  
  # Ensure cleanup on exit or interrupt
  trap 'cd / 2>/dev/null; rm -rf "$tmpdir"; cleanup_terminal; print_message error "Installation cancelled"; exit 130' EXIT INT TERM
  
  cd "$tmpdir"

  # Download compressed file (.gz)
  gz_filename="${filename}.gz"
  gz_url="${url}.gz"
  
  # Try download with progress (only works with curl)
  download_success=false
  if [ "$HAS_CURL" = true ]; then
    if download_with_progress "$gz_url" "$gz_filename"; then
      download_success=true
    elif curl -# -L -f -o "$gz_filename" "$gz_url"; then
      download_success=true
    fi
  else
    # wget - try with progress first, fallback to basic if not supported
    if wget --help 2>&1 | grep -q -- '--show-progress'; then
      wget --show-progress -q -O "$gz_filename" "$gz_url" && download_success=true
    else
      # BusyBox wget doesn't support --show-progress
      wget -O "$gz_filename" "$gz_url" && download_success=true
    fi
  fi

  if [ "$download_success" = false ]; then
    print_message error "Failed to download $gz_filename from $gz_url"
    exit 1
  fi
  
  if [ ! -f "$gz_filename" ]; then
    print_message error "Download failed - file not found: $gz_filename"
    exit 1
  fi
  
  # Check if gunzip is available
  if ! command -v gunzip >/dev/null 2>&1; then
    print_message error "gunzip is required but not installed"
    print_message error "Please install gzip: yum install gzip (RedHat/Amazon) or apt-get install gzip (Debian/Ubuntu)"
    exit 1
  fi
  
  # Decompress the file
  print_message info "${MUTED}Decompressing...${NC}"
  if ! gunzip "$gz_filename"; then
    print_message error "Failed to decompress $gz_filename"
    exit 1
  fi
  
  if [ ! -f "$filename" ]; then
    print_message error "Decompression failed - file not found: $filename"
    exit 1
  fi
  
  # Verify it's a valid binary, not an error page
  # Check if file command exists, fallback to checking ELF magic bytes
  if command -v file >/dev/null 2>&1; then
    if ! file "$filename" 2>/dev/null | grep -q -E "(executable|ELF|Mach-O|PE32)"; then
      print_message error "Downloaded file is not a valid executable (possibly a 404 or error page)"
      exit 1
    fi
  else
    # Fallback: check ELF magic bytes (0x7f 'E' 'L' 'F') or Mach-O magic
    if ! head -c 4 "$filename" 2>/dev/null | grep -q "^.ELF" && \
       ! head -c 4 "$filename" 2>/dev/null | od -An -tx1 | grep -q "7f 45 4c 46"; then
      print_message error "Downloaded file is not a valid executable (possibly a 404 or error page)"
      exit 1
    fi
  fi

  cp "$filename" "$INSTALL_DIR/agentuity"
  chmod 755 "${INSTALL_DIR}/agentuity"
  cd /
  rm -rf "$tmpdir"
  trap cleanup_terminal EXIT INT TERM
}

# Check for legacy installations before proceeding
check_brew_install
check_bun_install
check_legacy_binaries

# Check for musl/Alpine and handle gcompat
check_musl_and_gcompat

# NOTE: we will remove this once we are in production!
printf "\n"
printf "${RED}╭─────────────────────────────────────────────────────────────────────╮${NC}\n"
printf "${RED}│${NC}  ${RED}⚠  v1 ALPHA BUILD - NOT FOR PRODUCTION USE${NC}                         ${RED}│${NC}\n"
printf "${RED}├─────────────────────────────────────────────────────────────────────┤${NC}\n"
printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
printf "${RED}│${NC}  This is an Alpha build of the upcoming v1 production release.      ${RED}│${NC}\n"
printf "${RED}│${NC}  This build is ${RED}not ready for production${NC}.                            ${RED}│${NC}\n"
printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
printf "${RED}│${NC}  Please report any issues:                                          ${RED}│${NC}\n"
printf "${RED}│${NC}    • Discord: ${CYAN}https://discord.gg/agentuity${NC}                          ${RED}│${NC}\n"
printf "${RED}│${NC}    • GitHub:  ${CYAN}https://github.com/agentuity/sdk/discussions${NC}          ${RED}│${NC}\n"
printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
printf "${RED}│${NC}  ${MUTED}Thank you for your assistance during this final testing period!${NC}    ${RED}│${NC}\n"
printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
printf "${RED}╰─────────────────────────────────────────────────────────────────────╯${NC}\n"


if [ "$force_install" = false ]; then
  check_version
fi
download_and_install

add_to_path() {
  _atp_config_file=$1
  _atp_command=$2

  if grep -Fxq "$_atp_command" "$_atp_config_file"; then
    print_message debug "Command already exists in $_atp_config_file, skipping write."
  elif [ -w "$_atp_config_file" ]; then
    printf "\n# agentuity\n" >>"$_atp_config_file"
    printf "%s\n" "$_atp_command" >>"$_atp_config_file"
    print_message info "${MUTED}Successfully added ${NC}agentuity ${MUTED}to \$PATH in ${NC}$_atp_config_file"
    path_modified=true
  else
    print_message warning "Manually add the directory to $_atp_config_file (or similar):"
    print_message info "  $_atp_command"
    path_modified=true
  fi
}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}

current_shell=$(basename "${SHELL:-sh}")
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
  if [ -f "$file" ]; then
    config_file=$file
    break
  fi
done

if [ -z "$config_file" ]; then
  if [ "$non_interactive" = false ]; then
    print_message warning "No config file found for $current_shell"
    print_message info "Manually add to your PATH:"
    print_message info "  export PATH=$INSTALL_DIR:\$PATH"
  fi
else
  case ":$PATH:" in
    *":$INSTALL_DIR:"*)
      ;;
    *)

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
      print_message warning "Manually add the directory to your PATH:"
      print_message info "  export PATH=$INSTALL_DIR:\$PATH"
      ;;
    esac
    ;;
  esac
fi

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" = "true" ]; then
  printf "%s\n" "$INSTALL_DIR" >>$GITHUB_PATH
  print_message info "Added $INSTALL_DIR to \$GITHUB_PATH"
fi

printf "\n"
printf "${CYAN}╭────────────────────────────────────────────────────╮${NC}\n"
printf "${CYAN}│${NC} ⨺ Agentuity  The full-stack platform for AI agents ${CYAN}│${NC}\n"
printf "${CYAN}│${NC}                                                    ${CYAN}│${NC}\n"
printf "${CYAN}│${NC} Version:        ${specific_version}$(printf '%*s' $((35 - ${#specific_version})) '')${CYAN}│${NC}\n"
printf "${CYAN}│${NC} Docs:           https://agentuity.dev              ${CYAN}│${NC}\n"
printf "${CYAN}│${NC} Community:      https://discord.gg/agentuity       ${CYAN}│${NC}\n"
printf "${CYAN}│${NC} Dashboard:      https://app-v1.agentuity.com       ${CYAN}│${NC}\n"
printf "${CYAN}╰────────────────────────────────────────────────────╯${NC}\n"
printf "\n"

# Show prominent message if PATH was modified
if [ "$path_modified" = true ]; then
  printf "${RED}╭────────────────────────────────────────────────────╮${NC}\n"
  printf "${RED}│${NC} ${RED}⚠  ACTION REQUIRED${NC}                                 ${RED}│${NC}\n"
  printf "${RED}│${NC}                                                    ${RED}│${NC}\n"
  printf "${RED}│${NC}${MUTED} Your shell configuration has been updated.         ${RED}│${NC}\n"
  printf "${RED}│${NC}                                                    ${RED}│${NC}\n"
  printf "${RED}│ Please restart your terminal or run:               │${NC}\n"
  printf "${RED}│${NC}                                                    ${RED}│${NC}\n"

  if [ -n "$config_file" ]; then
    cmd="source $config_file"
    # Box width is 52 (between the borders)
    # Command takes: 1 space + cmd length
    # We need to pad the rest
    padding=$((52 - 1 - ${#cmd}))
    printf "${RED}│${NC} ${CYAN}%s${NC}%*s${RED}│${NC}\n" "$cmd" "$padding" ""
  else
    cmd="export PATH=$INSTALL_DIR:\$PATH"
    padding=$((52 - 2 - ${#cmd}))
    printf "${RED}│${NC}  ${CYAN}%s${NC}%*s${RED}│${NC}\n" "$cmd" "$padding" ""
  fi

  printf "${RED}╰────────────────────────────────────────────────────╯${NC}\n"
  printf "\n"
fi

printf "${MUTED}To get started, run:${NC}\n"
printf "\n"
printf "agentuity create       ${MUTED}Create a project${NC}\n"
printf "agentuity login        ${MUTED}Login to an existing account${NC}\n"
printf "agentuity help         ${MUTED}List commands and options${NC}\n"
