#!/bin/sh
# Agentuity CLI installer
# Installs the CLI via Bun global package install
set -eu

MUTED='\033[0;2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[38;2;0;139;139m'
NC='\033[0m' # No Color

MIN_BUN_VERSION="1.3.3"
SETUP_TOKEN="-"

requested_version=${VERSION:-}
force_install=false
non_interactive=false
path_modified=false
verbose=false

# Check for verbose mode via env var
if [ "${AGENTUITY_VERBOSE:-}" = "1" ] || [ "${AGENTUITY_VERBOSE:-}" = "true" ]; then
  verbose=true
fi

# Restore terminal state on exit/interrupt
cleanup_terminal() {
  printf '\033[?25h' 2>/dev/null || true
  stty sane 2>/dev/null || true
}

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
  -y | --yes | --non-interactive)
    non_interactive=true
    shift
    ;;
  -v | --verbose)
    verbose=true
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

# Check if we can prompt the user
if [ ! -t 0 ]; then
  if ! [ -r /dev/tty ] 2>/dev/null; then
    non_interactive=true
  fi
fi

raw_os=$(uname -s)
case "$raw_os" in
Darwin*) os="darwin" ;;
Linux*) os="linux" ;;
MINGW* | MSYS* | CYGWIN*)
  printf "${RED}Windows is not directly supported. Please use WSL (Windows Subsystem for Linux)${NC}\n"
  exit 1
  ;;
esac

print_message() {
  _pm_level=$1
  _pm_message=$2
  _pm_color=""

  # Debug messages only shown in verbose mode
  if [ "$_pm_level" = "debug" ] && [ "$verbose" != "true" ]; then
    return 0
  fi

  case $_pm_level in
  info) _pm_color="${NC}" ;;
  success) _pm_color="${GREEN}" ;;
  warning) _pm_color="${CYAN}" ;;
  error) _pm_color="${RED}" ;;
  debug) _pm_color="${MUTED}" ;;
  esac

  printf "${_pm_color}${_pm_message}${NC}\n"
}

# Ensure bun is on PATH
ensure_bun_on_path() {
  if command -v bun >/dev/null 2>&1; then
    return 0
  fi

  if [ -f "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
    return 0
  fi

  return 1
}

# Compare semantic versions: returns 0 if $1 >= $2
version_gte() {
  v1_major=$(echo "$1" | cut -d. -f1)
  v1_minor=$(echo "$1" | cut -d. -f2)
  v1_patch=$(echo "$1" | cut -d. -f3 | cut -d- -f1)
  v2_major=$(echo "$2" | cut -d. -f1)
  v2_minor=$(echo "$2" | cut -d. -f2)
  v2_patch=$(echo "$2" | cut -d. -f3 | cut -d- -f1)

  if [ "$v1_major" -gt "$v2_major" ]; then return 0; fi
  if [ "$v1_major" -lt "$v2_major" ]; then return 1; fi
  if [ "$v1_minor" -gt "$v2_minor" ]; then return 0; fi
  if [ "$v1_minor" -lt "$v2_minor" ]; then return 1; fi
  if [ "$v1_patch" -ge "$v2_patch" ]; then return 0; fi
  return 1
}

# Check if Bun is installed and meets minimum version
check_bun() {
  ensure_bun_on_path

  if ! command -v bun >/dev/null 2>&1; then
    print_message error "Bun is required but not installed."
    printf "\n"
    print_message info "Install Bun first by running:"
    printf "\n"
    print_message info "  ${CYAN}curl -fsSL https://bun.sh/install | bash${NC}"
    printf "\n"
    print_message info "Then run this installer again."
    exit 1
  fi

  bun_version=$(bun --version 2>/dev/null || echo "0.0.0")

  if ! version_gte "$bun_version" "$MIN_BUN_VERSION"; then
    print_message error "Bun version $bun_version is too old. Minimum required: $MIN_BUN_VERSION"
    printf "\n"
    print_message info "Update Bun by running:"
    printf "\n"
    print_message info "  ${CYAN}bun upgrade${NC}"
    exit 1
  fi

  print_message debug "Using Bun version $bun_version"
}

# Check for legacy Homebrew installation
check_brew_install() {
  if command -v brew >/dev/null 2>&1; then
    if brew list agentuity >/dev/null 2>&1; then
      print_message warning "${RED}Warning: ${NC}Legacy Go-based CLI installed via Homebrew detected."
      print_message info "${MUTED}The new version uses a different installation method.${NC}"

      if [ "$non_interactive" = false ]; then
        printf "Do you want to uninstall the Homebrew version? (y/N): "
        read -r response </dev/tty 2>/dev/null || read -r response
        case "$response" in
        [yY][eE][sS] | [yY])
          print_message info "${MUTED}Uninstalling Homebrew version...${NC}"
          if brew uninstall agentuity; then
            print_message info "${MUTED}Successfully uninstalled Homebrew version${NC}"
          else
            print_message error "Failed to uninstall Homebrew version. Please run: brew uninstall agentuity"
            exit 1
          fi
          ;;
        *)
          print_message warning "Keeping Homebrew version. This may cause conflicts."
          ;;
        esac
      else
        print_message info "${MUTED}Non-interactive mode: run 'brew uninstall agentuity' to remove legacy version${NC}"
      fi
    fi
  fi
}

# Check for legacy binary installation in ~/.agentuity/bin
check_legacy_binary() {
  legacy_bin="$HOME/.agentuity/bin/agentuity"
  if [ -f "$legacy_bin" ]; then
    # Check if it's an actual binary (not a shim we created)
    if file "$legacy_bin" 2>/dev/null | grep -qE "(executable|ELF|Mach-O)"; then
      print_message debug "Legacy binary installation detected at $legacy_bin"
      print_message debug "This will be replaced with a shim to the new installation."
    fi
  fi
}

# Install the CLI using bun
install_cli() {
  print_message debug "Installing Agentuity CLI..."

  if [ -n "$requested_version" ]; then
    # Normalize version (remove 'v' prefix if present)
    version=$(echo "$requested_version" | sed 's/^v//')
    print_message debug "Installing version $version"
    
    # Capture output and only show on failure
    install_output=$(bun add -g "@agentuity/cli@$version" 2>&1)
    install_result=$?
    
    if [ $install_result -ne 0 ]; then
      print_message error "Failed to install @agentuity/cli@$version"
      printf "%s\n" "$install_output"
      exit 1
    fi
    
    if [ "$verbose" = "true" ]; then
      printf "%s\n" "$install_output"
    fi
  else
    print_message debug "Installing latest version"
    
    # Capture output and only show on failure
    install_output=$(bun add -g @agentuity/cli 2>&1)
    install_result=$?
    
    if [ $install_result -ne 0 ]; then
      print_message error "Failed to install @agentuity/cli"
      printf "%s\n" "$install_output"
      exit 1
    fi
    
    if [ "$verbose" = "true" ]; then
      printf "%s\n" "$install_output"
    fi
  fi

  print_message debug "Agentuity CLI installed successfully!"
}

# Create a shim in ~/.agentuity/bin for backward compatibility
create_legacy_shim() {
  legacy_dir="$HOME/.agentuity/bin"
  legacy_bin="$legacy_dir/agentuity"
  bun_bin="$HOME/.bun/bin/agentuity"

  # Only create shim if ~/.agentuity/bin exists or was previously used
  if [ -d "$legacy_dir" ] || [ -f "$legacy_bin" ]; then
    mkdir -p "$legacy_dir"

    # Create a shim script that forwards to the bun-installed version
    cat > "$legacy_bin" << 'EOF'
#!/bin/sh
exec "$HOME/.bun/bin/agentuity" "$@"
EOF
    chmod 755 "$legacy_bin"
    print_message debug "Created compatibility shim at $legacy_bin"
  fi
}

# Add bun bin to PATH in shell config
add_to_path() {
  _atp_config_file=$1
  _atp_command=$2
  _atp_name=${3:-agentuity}

  if grep -Fxq "$_atp_command" "$_atp_config_file" 2>/dev/null; then
    print_message debug "Command already exists in $_atp_config_file, skipping write."
  elif [ -w "$_atp_config_file" ]; then
    printf "\n# %s\n" "$_atp_name" >>"$_atp_config_file"
    printf "%s\n" "$_atp_command" >>"$_atp_config_file"
    print_message info "${MUTED}Successfully added ${NC}$_atp_name ${MUTED}to \$PATH in ${NC}$_atp_config_file"
    path_modified=true
  else
    print_message warning "Manually add the directory to $_atp_config_file (or similar):"
    print_message info "  $_atp_command"
    path_modified=true
  fi
}

configure_path() {
  bun_bin_dir="$HOME/.bun/bin"

  # Check if bun bin is already on PATH
  case ":$PATH:" in
  *":$bun_bin_dir:"*)
    print_message debug "Bun bin directory already on PATH"
    return 0
    ;;
  esac

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
  ash | sh)
    config_files="$HOME/.ashrc $HOME/.profile /etc/profile"
    ;;
  *)
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
    case $current_shell in
    fish) config_file="$HOME/.config/fish/config.fish" && mkdir -p "$(dirname "$config_file")" ;;
    zsh) config_file="$HOME/.zshrc" ;;
    bash) config_file="$HOME/.bashrc" ;;
    ash | sh) config_file="$HOME/.profile" ;;
    *) config_file="$HOME/.profile" ;;
    esac

    if [ ! -f "$config_file" ]; then
      touch "$config_file" 2>/dev/null || true
    fi

    if [ ! -w "$config_file" ]; then
      print_message warning "Cannot create or write to $config_file"
      print_message info "Manually add to your PATH:"
      print_message info "  export PATH=$bun_bin_dir:\$PATH"
      return 0
    fi
  fi

  case $current_shell in
  fish)
    add_to_path "$config_file" "fish_add_path $bun_bin_dir" "bun"
    ;;
  *)
    add_to_path "$config_file" "export PATH=$bun_bin_dir:\$PATH" "bun"
    ;;
  esac
}

# GitHub Actions PATH setup
setup_github_actions() {
  if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" = "true" ]; then
    printf "%s\n" "$HOME/.bun/bin" >>"$GITHUB_PATH"
    print_message info "Added $HOME/.bun/bin to \$GITHUB_PATH"
  fi
}

show_path_reminder() {
  if [ "$path_modified" = true ]; then
    printf "\n"
    printf "${RED}╭────────────────────────────────────────────────────╮${NC}\n"
    printf "${RED}│${NC} ${RED}⚠  ACTION REQUIRED${NC}                                 ${RED}│${NC}\n"
    printf "${RED}│${NC}                                                    ${RED}│${NC}\n"
    printf "${RED}│${NC}${MUTED} Your shell configuration has been updated.         ${RED}│${NC}\n"
    printf "${RED}│${NC}                                                    ${RED}│${NC}\n"
    printf "${RED}│ Please restart your terminal or run:               │${NC}\n"
    printf "${RED}│${NC}                                                    ${RED}│${NC}\n"
    printf "${RED}│${NC} ${CYAN}source ~/.bashrc${NC}                                   ${RED}│${NC}\n"
    printf "${RED}╰────────────────────────────────────────────────────╯${NC}\n"
  fi
}

run_setup() {
  agentuity_bin="$HOME/.bun/bin/agentuity"

  if [ -x "$agentuity_bin" ]; then
    if [ "$non_interactive" = true ]; then
      "$agentuity_bin" setup --non-interactive --setup-token "${SETUP_TOKEN}" || true
    else
      "$agentuity_bin" setup --setup-token "${SETUP_TOKEN}" || true
    fi
  else
    print_message warning "Could not run setup - agentuity not found at $agentuity_bin"
    print_message info "Try restarting your terminal and running: agentuity setup"
  fi
}

# Progress indicator for installation
show_progress() {
  _msg="$1"
  if [ -t 1 ]; then
    # TTY: show message that will be overwritten
    printf "${CYAN}◐${NC} %s" "$_msg"
  else
    # Not a TTY: just print the message
    printf "%s\n" "$_msg"
  fi
}

clear_progress() {
  if [ -t 1 ]; then
    # Clear the line
    printf "\r\033[K"
  fi
}

# Show beta banner
show_beta_banner() {
  printf "\n"
  printf "${RED}╭─────────────────────────────────────────────────────────────────────╮${NC}\n"
  printf "${RED}│${NC}  ${RED}⚠  v1 BETA BUILD - READY FOR PRODUCTION TESTING${NC}                    ${RED}│${NC}\n"
  printf "${RED}├─────────────────────────────────────────────────────────────────────┤${NC}\n"
  printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
  printf "${RED}│${NC}  This is a Beta build of the upcoming v1 production release.        ${RED}│${NC}\n"
  printf "${RED}│${NC}  This build is ${RED}ready for production testing${NC}.                        ${RED}│${NC}\n"
  printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
  printf "${RED}│${NC}  Please report any issues:                                          ${RED}│${NC}\n"
  printf "${RED}│${NC}    • Discord: ${CYAN}https://discord.gg/agentuity${NC}                          ${RED}│${NC}\n"
  printf "${RED}│${NC}    • GitHub:  ${CYAN}https://github.com/agentuity/sdk/discussions${NC}          ${RED}│${NC}\n"
  printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
  printf "${RED}│${NC}  ${MUTED}Thank you for your assistance during this final testing period!${NC}    ${RED}│${NC}\n"
  printf "${RED}│${NC}                                                                     ${RED}│${NC}\n"
  printf "${RED}╰─────────────────────────────────────────────────────────────────────╯${NC}\n"
  printf "\n"
}

# Main installation flow
main() {
  # Show beta banner (unless hidden via env var)
  if [ "${AGENTUITY_HIDE_BANNER:-}" != "true" ]; then
    show_beta_banner
  fi

  # Check prerequisites first (before progress indicator)
  check_bun

  # Check for legacy installations
  check_brew_install
  check_legacy_binary

  # Show progress indicator
  show_progress "Installing Agentuity CLI..."

  # Install the CLI
  install_cli
  
  # Create backward compatibility shim if needed
  create_legacy_shim

  # Configure PATH
  configure_path

  # GitHub Actions setup
  setup_github_actions

  # Clear progress indicator
  clear_progress

  # Show PATH reminder if needed
  show_path_reminder

  # Run setup
  run_setup
}

main
