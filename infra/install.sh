#!/bin/sh
#
# storytree - Linux bootstrap installer (POSIX sh). The parity sibling of infra/install.ps1.
#
# ADR-0207 D1 decided ONE re-runnable terminal command that takes a machine from nothing to a
# cloned, provisioned checkout. Only the Windows half was ever built; install.ps1's own header
# names this file as the follow-on. This is that follow-on - PARITY work, not new design.
#
# LOAD-BEARING INVARIANT (ADR-0207 D1 / D6): every step is IDEMPOTENT and no-ops when already
# satisfied. Re-running is both the retry story AND the repair story - D6's `storytree doctor`
# guide re-invokes these same steps to fix a broken environment. So an install step that is not
# safely re-runnable is a bug even when a first install succeeds. The `run_step` runner below
# enforces this: it NEVER runs a step's install action while that step's check already passes.
#
# TARGETED REPAIR (ADR-0207 D6): `--step <name>` runs ONE step and stops. There is ONE step
# inventory ($STEPS below), read by dispatch, by `--help` and by the unknown-name error alike, and
# enforced in both directions at runtime - a run_step call whose name is not in the inventory dies,
# and an inventory name that no run_step call declares dies. So every declared step is invocable by
# construction and there is no second list to drift against. An unknown name fails loudly and lists
# the valid ones - a mistyped repair must never read as a successful one.
#
# TRUST INVARIANT (ADR-0207 D3): storytree NEVER handles Claude credentials. This script installs
# the Claude Code CLI and points the human at `claude` login - they complete OAuth in their own
# browser with their own subscription, and the credential lands in their own ~/.claude. This
# script only DETECTS a logged-in CLI (an existence probe); it never reads or captures a token.
#
# SCOPE FENCE. This reaches a CLONED, INSTALLED checkout and stops. It does NOT provision dev
# credentials (gcloud ADC, ~/.storytree/secrets.json, database access) - that is a separate
# follow-on with a different persona, see infra/install.md. No Blender, no GPU backend, no herdr.
#
# ---------------------------------------------------------------------------------------------
# THREE THINGS DECIDED HERE RATHER THAN COPIED FROM THE WINDOWS SCRIPT
#
# 1. NODE 24 FROM NODESOURCE, NOT nvm. Both work; NodeSource wins on three counts for THIS script.
#    (a) The installer already needs root for apt (git, gh), so root is not a new requirement.
#    (b) NodeSource puts `node` on the system PATH immediately, so the runner's post-install
#        re-check converges inside the SAME process. nvm is a shell FUNCTION sourced from a
#        profile: a non-interactive `sh` script cannot make it stick for the user's next shell,
#        and `command -v node` would keep failing after a "successful" install - which would trip
#        the convergence guard and report a false failure.
#    (c) One system-wide version matches the dev-box persona; juggling Node versions is not this
#        machine's job. Someone who DOES want nvm should install Node 24 their own way and skip
#        this step - `--step` never forces it, and every other step's check is version-agnostic.
#
# 2. THE GITHUB CLI COMES FROM GITHUB'S OWN APT REPO, not the distro archive. Mint/Ubuntu ship a
#    gh that lags badly, and this installer depends on `gh auth login`'s browser/device flow and
#    on gh configuring git's credential helper for the HTTPS clone in @step:clone.
#
# 3. ASCII-ONLY IS KEPT, BUT FOR A DIFFERENT AND WEAKER REASON - it is NOT inherited by cargo
#    cult. install.ps1 is ASCII because Windows PowerShell 5.1 mis-decodes non-ASCII bytes in a
#    BOM-less UTF-8 file fetched through `irm | iex`. That reason does not apply here at all: sh
#    is byte-oriented and never decodes the script, so UTF-8 in this file could not break
#    execution. The reason that DOES apply is narrower: this script prints diagnostics on boxes
#    that may run under LC_ALL=C or a bare `sudo` environment, where non-ASCII output bytes render
#    as mojibake in the terminal. Strictly, only PRINTED strings need to be ASCII - but "printed
#    string" is not mechanically checkable from outside, while "the file is ASCII" is. So the
#    whole-file rule is kept as the cheap enforceable proxy for the real constraint, and
#    packages/cli/src/install-sh-script.test.ts asserts it.
#
# ALSO DELIBERATELY DIFFERENT: no trailing desktop-app launch. install.ps1 ends with
# `pnpm desktop:start` because it onboards an EXPLORER, for whom the app IS the product. This
# script provisions a dev box, where the app is one thing among many and launching it uninvited
# is noise. Verification still ends with `storytree doctor`, exactly as on Windows.
#
# AND: plain-text output, no ANSI colour. install.ps1 uses Write-Host colours; the common delivery
# route here is `curl ... | sh`, whose output is frequently redirected to a file or a log where
# escape codes are just litter. Every line is prefixed with its level instead.
#
# ---------------------------------------------------------------------------------------------
# VERIFICATION STATUS - READ THIS BEFORE TRUSTING ANY BRANCH BELOW.
#
# This file was authored on a Windows box. Most of it has NEVER BEEN EXECUTED. What follows is an
# honest split, and it is deliberately pessimistic: a confident wrong claim here would corrupt the
# blind-onboarding run this exists to unblock.
#
#   VERIFIED (actually executed against this file):
#     - It parses as POSIX sh (`dash -n infra/install.sh`), so there are no bashisms or syntax
#       errors. dash is the /bin/sh on Debian/Ubuntu/Mint, which is the shell that will run it.
#     - `--help` prints usage and exits 0.
#     - An unknown `--step` name exits non-zero, runs NO step's check or install, and lists the
#       valid names.
#     - `--step git` on a machine that already has git reports "already satisfied" and runs no
#       install action (the idempotency guard, exercised end-to-end).
#
#   UNVERIFIED (never executed - no Linux machine was available while authoring):
#     - EVERY install action: apt-get, the NodeSource setup script, GitHub's apt repo + keyring,
#       `corepack enable pnpm`, `gh auth login`, `git clone`, `pnpm install`, and the Claude CLI
#       installer at https://claude.ai/install.sh.
#     - EVERY check EXCEPT check_git: node version parsing, gh auth status, the clone remote
#       match, the provisioned marker, and the claude binary probe.
#     - The `as_root` / sudo path in all its forms.
#     - That https://claude.ai/install.sh puts `claude` in ~/.local/bin (the PATH fix-up below
#       assumes it does; if it lands elsewhere the post-install check fails LOUDLY rather than
#       silently, which is the safe direction).
#     - The trailing `storytree doctor` invocation and the Claude-login existence probe.
#
# Individual unverified branches are marked UNVERIFIED inline. The first real Linux run is what
# verifies them; until then, treat a failure here as "the installer is wrong", not "the box is".
# ---------------------------------------------------------------------------------------------
#
# Usage:
#   sh infra/install.sh
#   sh infra/install.sh --checkout-dir /opt/storytree
#   sh infra/install.sh --step node          # targeted repair: re-run ONE idempotent step
#
#   # or, once install.sh is published beside install.ps1 in the distribution bucket
#   # (see infra/install.md - it is NOT published yet):
#   #   curl -fsSL https://storage.googleapis.com/storytree-dist/install.sh | sh

set -eu

# --- configuration -------------------------------------------------------------------------------

# Where the checkout lands. Default: ~/storytree (mirrors install.ps1's %USERPROFILE%\storytree).
CHECKOUT_DIR="${STORYTREE_CHECKOUT_DIR:-$HOME/storytree}"
# The clone URL (storytree-ai org - capital S retained after the ADR-0207 D2 transfer).
REPO_URL="${STORYTREE_REPO_URL:-https://github.com/storytree-ai/Storytree.git}"
# Run ONLY this `# @step:<name>` and stop (the D6 targeted repair). Empty = full sequence.
STEP=""
# The workspace engine floor. Mirrors packages/cli/src/doctor.ts NODE_MAJOR_FLOOR.
NODE_MAJOR_FLOOR=24

# THE step inventory, in dependency order - the ONE list. `--step` dispatch, the unknown-name
# error and `--help` all read it, and it is enforced in BOTH directions at runtime: run_step
# refuses a name that is not in this list, and after the sequence every name in this list must
# have been declared by a run_step call. So a step cannot exist outside the inventory, and the
# inventory cannot advertise a step that is not runnable. There is nothing to drift against.
STEPS="git node pnpm gh-cli github-auth clone provision claude-cli"

TAG="[storytree-install]"

usage() {
    cat <<USAGE
storytree - Linux bootstrap installer (ADR-0207 D1)

Takes a bare Debian/Ubuntu/Mint machine to a cloned, provisioned storytree checkout.
Every step is idempotent: re-running is both the retry story and the repair story.

Usage:
  sh install.sh [options]

Options:
  --checkout-dir <path>   Where the checkout lands (default: ~/storytree)
  --repo-url <url>        Clone URL (default: the storytree-ai/Storytree HTTPS remote)
  --step <name>           Run ONLY this step and stop - the targeted repair.
                          Steps, in dependency order:
                            $STEPS
  -h, --help              Print this and exit.

Environment:
  STORYTREE_CHECKOUT_DIR  Same as --checkout-dir.
  STORYTREE_REPO_URL      Same as --repo-url.

This installer stops at a provisioned checkout. Dev credentials (gcloud ADC,
~/.storytree/secrets.json, database access) are the next step - see docs/machine-onboarding.md.
USAGE
}

# --- output helpers (ASCII only - see the header's decision 3) ------------------------------------

info() { printf '%s INFO %s\n' "$TAG" "$1"; }
ok() { printf '%s OK   %s\n' "$TAG" "$1"; }
warn() { printf '%s WARN %s\n' "$TAG" "$1" >&2; }
die() {
    printf '%s FAIL %s\n' "$TAG" "$1" >&2
    exit 1
}

# --- argument parsing -----------------------------------------------------------------------------

while [ $# -gt 0 ]; do
    case "$1" in
        --checkout-dir)
            [ $# -ge 2 ] || die "--checkout-dir needs a path."
            CHECKOUT_DIR="$2"
            shift 2
            ;;
        --repo-url)
            [ $# -ge 2 ] || die "--repo-url needs a URL."
            REPO_URL="$2"
            shift 2
            ;;
        --step)
            [ $# -ge 2 ] || die "--step needs a step name."
            STEP="$2"
            shift 2
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *) die "unknown option '$1'. Run with --help for usage." ;;
    esac
done

# --- primitives -----------------------------------------------------------------------------------

# True iff a command is resolvable on PATH (the universal "already satisfied" primitive).
have() { command -v "$1" >/dev/null 2>&1; }

# Run a command with root privileges. On a normal Mint desktop the installing user is a sudoer; in
# a container this script may already BE root, where sudo is often not installed at all.
# UNVERIFIED: neither branch has been executed.
as_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    elif have sudo; then
        sudo "$@"
    else
        die "this step needs root, and 'sudo' is not installed. Re-run as root, or install sudo."
    fi
}

require_apt() {
    have apt-get ||
        die "this installer targets Debian/Ubuntu/Mint (apt-get was not found). On another distro, install git, Node ${NODE_MAJOR_FLOOR}+, pnpm and the GitHub CLI by hand, then re-run - every step will report 'already satisfied' and skip."
}

# `apt-get update` is slow, so run it at most once per invocation. Steps that ADD a repository
# reset this flag, because the cached index cannot know about a source that did not exist yet.
APT_UPDATED=0
apt_refresh() {
    if [ "$APT_UPDATED" -eq 0 ]; then
        as_root apt-get update -y
        APT_UPDATED=1
    fi
}

# UNVERIFIED: never executed.
apt_install() {
    require_apt
    apt_refresh
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

# Fetch a URL to a file. Mint ships both curl and wget, but a minimal container may have neither -
# fail with a sentence that says what to do rather than "command not found".
# UNVERIFIED: never executed.
fetch_file() {
    if have curl; then
        curl -fsSL "$1" -o "$2"
    elif have wget; then
        wget -q -O "$2" "$1"
    else
        die "neither curl nor wget is available; install one ('apt-get install curl') and re-run."
    fi
}

# --- the idempotent step runner -------------------------------------------------------------------
#
# The load-bearing invariant lives HERE. The check function returns 0 when the step is already
# satisfied; in that case the install function is NEVER called (the no-op-when-satisfied contract).
# After an install, the check is re-run to confirm convergence; a step that does not converge dies.
#
# Dispatch reads the single $STEPS inventory declared above, and run_step refuses any name that is
# not in it - so `--step`, `--help` and the unknown-name error can never disagree about what exists.

STEPS_DECLARED=""
STEP_MATCHED=0

# True iff $1 is a member of the space-separated $STEPS inventory.
step_declared() {
    case " $STEPS " in
        *" $1 "*) return 0 ;;
        *) return 1 ;;
    esac
}

# run_step <name> <check-function> <install-function>
run_step() {
    step_declared "$1" ||
        die "internal error: step '$1' is not in the STEPS inventory. Add it there, in order."
    STEPS_DECLARED="${STEPS_DECLARED:+$STEPS_DECLARED }$1"
    # --step: run ONLY the named step. A non-matching step is skipped WHOLE - neither its check
    # nor its install runs - so a targeted repair cannot have side effects elsewhere.
    if [ -n "$STEP" ]; then
        if [ "$1" != "$STEP" ]; then
            return 0
        fi
        STEP_MATCHED=1
    fi
    if "$2"; then
        ok "$1 - already satisfied"
        return 0
    fi
    info "$1 - setting up..."
    "$3"
    if "$2"; then
        ok "$1 - done"
        return 0
    fi
    die "$1 - still not satisfied after setup; re-run or escalate."
}

# --- step checks ------------------------------------------------------------------------------------

check_git() { have git; }

# UNVERIFIED: the version-parse branch has not been executed (only the have-node path).
check_node24() {
    have node || return 1
    _node_raw="$(node --version 2>/dev/null)" || return 1
    _node_major="${_node_raw#v}"
    _node_major="${_node_major%%.*}"
    case "$_node_major" in
        '' | *[!0-9]*) return 1 ;;
    esac
    [ "$_node_major" -ge "$NODE_MAJOR_FLOOR" ]
}

check_pnpm() { have pnpm; }

check_gh_cli() { have gh; }

# UNVERIFIED: never executed.
check_github_auth() {
    have gh || return 1
    gh auth status --hostname github.com >/dev/null 2>&1
}

# UNVERIFIED: never executed.
check_clone() {
    [ -d "$CHECKOUT_DIR/.git" ] || return 1
    _clone_remote="$(git -C "$CHECKOUT_DIR" remote get-url origin 2>/dev/null)" || return 1
    # Both spellings: the canonical remote is capital-S `Storytree`, but GitHub resolves the
    # lowercase form too, so a hand-typed clone URL is a legitimate match and not a wrong repo.
    # (install.ps1 gets this for free - PowerShell's -match is case-insensitive by default.)
    case "$_clone_remote" in
        *storytree-ai/Storytree*) return 0 ;;
        *storytree-ai/storytree*) return 0 ;;
        *) return 1 ;;
    esac
}

# pnpm writes node_modules/.modules.yaml only when an install COMPLETES - the same provisioned
# marker packages/cli/provision-worktree.mjs keys on. Absence => fresh or truncated => re-provision.
# UNVERIFIED: never executed.
check_provisioned() { [ -f "$CHECKOUT_DIR/node_modules/.modules.yaml" ]; }

check_claude_cli() { have claude; }

# --- step installs ----------------------------------------------------------------------------------
# EVERY function in this section is UNVERIFIED - none has been executed. See the header.

install_git() { apt_install git; }

install_node() {
    require_apt
    have bash || die "NodeSource's setup script requires bash, which was not found. Install bash, or install Node ${NODE_MAJOR_FLOOR}+ by hand and re-run."
    apt_install ca-certificates curl gnupg
    _ns_setup="$(mktemp)" || die "could not create a temporary file."
    # Downloaded to a file and then run, rather than piped straight into a root shell, so the
    # thing about to run as root is at least inspectable if this ever needs debugging.
    fetch_file "https://deb.nodesource.com/setup_${NODE_MAJOR_FLOOR}.x" "$_ns_setup"
    as_root bash "$_ns_setup"
    rm -f "$_ns_setup"
    APT_UPDATED=0 # NodeSource just added a repository; the cached index predates it.
    apt_install nodejs
}

install_pnpm() {
    have corepack || die "corepack is missing (it ships with Node >= 16). Run '--step node' first."
    # corepack writes its shims beside the node binary. NodeSource installs node root-owned under
    # /usr, so that needs root - but a user-owned Node (nvm, asdf, a tarball) does not. Try
    # unprivileged first, so this step also works for someone who brought their own Node 24 and
    # skipped @step:node.
    if corepack enable pnpm >/dev/null 2>&1; then
        return 0
    fi
    as_root corepack enable pnpm
}

install_gh_cli() {
    require_apt
    apt_install ca-certificates curl gnupg
    as_root install -d -m 0755 /etc/apt/keyrings
    _gh_key="$(mktemp)" || die "could not create a temporary file."
    fetch_file "https://cli.github.com/packages/githubcli-archive-keyring.gpg" "$_gh_key"
    # Re-running rewrites the keyring and the source list with identical content, which is why
    # this step stays safely idempotent even though it mutates system state.
    as_root install -D -o root -g root -m 0644 "$_gh_key" /etc/apt/keyrings/githubcli-archive-keyring.gpg
    rm -f "$_gh_key"
    _gh_arch="$(dpkg --print-architecture)"
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
        "$_gh_arch" | as_root tee /etc/apt/sources.list.d/github-cli.list >/dev/null
    APT_UPDATED=0 # A new repository was just added; the cached index predates it.
    apt_install gh
}

install_github_auth() {
    have gh || die "the GitHub CLI is missing. Run '--step gh-cli' first."
    info "a browser will open for GitHub sign-in; enter the one-time code shown here."
    # --git-protocol https also configures git's credential helper, which is what authenticates
    # the HTTPS clone in @step:clone. On a HEADLESS box there is no browser to open: drop --web
    # and choose "Login with a web browser" to get a device code you can enter elsewhere.
    gh auth login --hostname github.com --git-protocol https --web
}

install_clone() {
    _clone_parent="$(dirname "$CHECKOUT_DIR")"
    [ -d "$_clone_parent" ] || mkdir -p "$_clone_parent"
    git clone "$REPO_URL" "$CHECKOUT_DIR"
}

install_provision() {
    [ -d "$CHECKOUT_DIR" ] || die "no checkout at '$CHECKOUT_DIR'. Run '--step clone' first."
    # Subshell, so the directory change cannot leak into the rest of the run.
    (
        cd "$CHECKOUT_DIR" || exit 1
        # The workspace pins its pnpm version via package.json "packageManager"; corepack
        # activates that exact version. Non-fatal: @step:pnpm already put pnpm on PATH, and this
        # may lack permission to rewrite a root-owned shim.
        corepack enable pnpm >/dev/null 2>&1 || true
        pnpm install
    )
}

install_claude_cli() {
    # The official installer - the sh sibling of the claude.ai/install.ps1 the Windows script uses.
    # D3: this installs the CLI and NOTHING ELSE. No credential is fetched, written, or read here;
    # the human signs in themselves afterwards.
    _claude_setup="$(mktemp)" || die "could not create a temporary file."
    fetch_file "https://claude.ai/install.sh" "$_claude_setup"
    sh "$_claude_setup"
    rm -f "$_claude_setup"
    # UNVERIFIED ASSUMPTION: the installer lands `claude` in ~/.local/bin, which is not on PATH in
    # a non-login shell. Put it on PATH for THIS process so the runner's post-install re-check can
    # converge (install.ps1 does the same job with Update-SessionPath). If the binary lands
    # somewhere else, the re-check fails loudly - which is the safe direction, not a silent pass.
    case ":$PATH:" in
        *":$HOME/.local/bin:"*) : ;;
        *)
            PATH="$HOME/.local/bin:$PATH"
            export PATH
            ;;
    esac
}

# --- the install sequence ---------------------------------------------------------------------------
# Each idempotent prerequisite carries a `# @step:<name>` marker (asserted by the structural test in
# packages/cli/src/install-sh-script.test.ts, which also holds this inventory to install.ps1's).
# Ordered: each step's check assumes its predecessors.

info "storytree bootstrap - Linux installer (ADR-0207 D1)."
info "checkout: $CHECKOUT_DIR"

# @step:git - version control, and the clone below needs it.
run_step git check_git install_git

# @step:node - Node 24+ (the workspace engine floor); brings corepack for pnpm.
run_step node check_node24 install_node

# @step:pnpm - the workspace package manager, activated via corepack (ships with Node).
run_step pnpm check_pnpm install_pnpm

# @step:gh-cli - the GitHub CLI drives the sign-in in the next step.
run_step gh-cli check_gh_cli install_gh_cli

# @step:github-auth - GitHub sign-in (the one code the human enters). Read access comes from the
# owner-granted Read role on the storytree-ai org (ADR-0207 D2).
run_step github-auth check_github_auth install_github_auth

# @step:clone - the checkout. gh's credential helper authenticates the HTTPS clone.
run_step clone check_clone install_clone

# @step:provision - install workspace deps (idempotent: no-op once .modules.yaml exists).
run_step provision check_provisioned install_provision

# @step:claude-cli - the human's OWN agent. Install the CLI; they log in themselves (D3 trust
# invariant - storytree detects a logged-in CLI, never handles the credential).
run_step claude-cli check_claude_cli install_claude_cli

# --- targeted repair (--step) stops here --------------------------------------------------------------
# A --step run is the D6 repair loop enacting ONE idempotent step; the guide re-doctors afterwards, so
# the installer skips the trailing verify and login notice entirely. An unknown step name is a loud
# failure, never a silent no-op that the guide would misread as a successful repair.

# The inventory's OTHER direction: every name in $STEPS must have been declared by a run_step call
# above. Without this, --help and the unknown-step error could advertise a step that nothing runs -
# and a repair naming it would report success having done nothing at all.
for _declared in $STEPS; do
    case " $STEPS_DECLARED " in
        *" $_declared "*) : ;;
        *) die "internal error: step '$_declared' is in STEPS but no run_step call declares it." ;;
    esac
done

if [ -n "$STEP" ]; then
    if [ "$STEP_MATCHED" -eq 0 ]; then
        die "unknown --step '$STEP'. Valid steps: $STEPS"
    fi
    ok "step '$STEP' complete."
    exit 0
fi

# --- trailing actions (not idempotent-convergent steps) -----------------------------------------------
# UNVERIFIED: neither trailing action has been executed.

# Verify the setup with `storytree doctor` (ADR-0207 D6: the installer verifies with it). doctor is
# read-only; a non-zero exit (e.g. Claude login still pending) does NOT halt this script - it is
# surfaced, and re-running the doctor or this installer is the repair loop.
info "verifying setup with 'storytree doctor'..."
if (cd "$CHECKOUT_DIR" && pnpm storytree doctor); then
    :
else
    warn "doctor could not run, or reported problems - see its output above."
fi

# Claude login is the human's action in their own browser: DETECT and INSTRUCT, never capture (D3).
# A logged-in CLI writes ~/.claude/.credentials.json; its EXISTENCE is the signal. This script never
# reads the file's contents, and install-sh-script.test.ts asserts that it does not.
if [ -f "$HOME/.claude/.credentials.json" ]; then
    ok "Claude login - detected"
else
    warn "Claude login - not yet done. Run 'claude' and complete sign-in in your browser (your own subscription)."
fi

# No desktop-app launch here, by decision - see the header. This is a dev box, not an explorer's.
ok "storytree bootstrap complete: cloned and provisioned at $CHECKOUT_DIR."
info "NEXT - this installer stops at a provisioned checkout. Dev credentials (gcloud ADC,"
info "       ~/.storytree/secrets.json, database access) are the next step, and they have their"
info "       own guide: docs/machine-onboarding.md in the checkout you just cloned."
