# gemit-cli

<div align="center">

![gemit logo](https://erickn-dev.github.io/gemit-site/logo.png)

**AI-powered Git workflow automation from your terminal**

[![npm version](https://img.shields.io/npm/v/gemit-cli.svg)](https://www.npmjs.com/package/gemit-cli)
[![npm downloads](https://img.shields.io/npm/dm/gemit-cli.svg)](https://www.npmjs.com/package/gemit-cli)
[![License](https://img.shields.io/npm/l/gemit-cli.svg)](https://github.com/erickn-dev/gemit/blob/main/LICENSE)

[Website](https://erickn-dev.github.io/gemit-site/) • [NPM Stats](https://erickn-dev.github.io/gemit-site/dashboard/) • [Discord Community](https://discord.gg/CJqy69MGD2)

</div>

## Overview

**Gemit** is a Node.js CLI that leverages AI to streamline your Git workflow. It generates conventional commit messages, branch names, PR descriptions, code reviews, changelogs, and more — with confirmation before executing any Git command.

### Key Features

- **AI-Powered Suggestions** - Generate commit messages, branch names, and PR descriptions
- **Code Review** - Get AI feedback on staged changes before committing
- **Conventional Commits** - Automatic conventional commit format with type detection
- **Smart Branching** - Create semantic branches in `<type>/<kebab-case>` format
- **Changelog Generation** - Automatic changelog creation from commit history
- **Workflow Automation** - 4-step commit flow with lint/test integration
- **Multi-Language** - Support for English and Portuguese (pt-br)
- **Auto-Updates** - Periodic version checks with automatic updates
- **Customizable Prompts** - Override AI instructions globally without touching projects
- **Multiple AI Providers** - Support for Google (Gemini), OpenAI (GPT), and Anthropic (Claude)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands Reference](#commands-reference)
- [Advanced Usage](#advanced-usage)
- [Prompt Customization](#prompt-customization)
---
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
---
- [Community](#community)
- [License](#license)

## Prerequisites

- **Node.js** (LTS version recommended)
- **Git** repository (must be inside a Git project)
- **API Key** from one of the supported providers:
  - [Google AI Studio](https://aistudio.google.com/) (Gemini)
  - [OpenAI Platform](https://platform.openai.com/) (GPT)
  - [Anthropic Console](https://console.anthropic.com/) (Claude)


## Installation

### Global Installation (Recommended)

```bash
npm install -g gemit-cli
```

Works on **Windows**, **Linux**, and **macOS**.

### Verify Installation

```bash
gemit --version
gemit doctor
```

## Quick Start

### 1. Initialize Configuration

```bash
gemit init
```

This interactive wizard will prompt you to:
- Select AI provider (google, openai, or anthropic)
- Choose model
- Enter API key
- Set language preference (en or pt-br)

### 2. Make Your First AI-Powered Commit

```bash
# Stage your changes
git add .

# Get AI-suggested commit message
gemit

# Or use the full flow with automatic staging
gemit commit --all
```

### 3. Create a Semantic Branch

```bash
gemit branch "add user authentication feature"
# Suggests: feat/add-user-authentication-feature
```

## Configuration

### Configuration File Location

gemit stores configuration globally in a `.env` file:

- **Windows**: `%APPDATA%\gemit\.env`
- **macOS**: `~/Library/Application Support/gemit/.env`
- **Linux**: `~/.config/gemit/.env`

### Supported Environment Variables

```env
# Provider Configuration
LLM_PROVIDER="google"              # google, openai, or anthropic
LLM_MODEL="gemini-2.5-flash"       # Model name
GEMIT_LANGUAGE="en"                # en or pt-br

# API Keys (set only the one for your provider)
GOOGLE_API_KEY="your-key-here"
GEMINI_API_KEY="your-key-here"     # Alternative to GOOGLE_API_KEY
OPENAI_API_KEY="your-key-here"
ANTHROPIC_API_KEY="your-key-here"
```

### Default Models by Provider

| Provider | Default Model |
|----------|--------------|
| **google** | `gemini-2.5-flash` |
| **openai** | `gpt-4o-mini` |
| **anthropic** | `claude-3-5-sonnet-latest` |

### Update Configuration

```bash
# Update a single value without re-running init
gemit config --set LLM_MODEL=gpt-4o
gemit config --set GEMIT_LANGUAGE=pt-br

# List all current settings
gemit config --list
```

## Commands Reference

### Core Commands

#### `gemit` (Default)

Suggest commit message using currently staged files.

```bash
gemit
```

#### `gemit commit [options]`

Full commit workflow: stage → summary → AI suggestion → confirmation → commit → push prompt.

**Options:**
- `--all` - Run `git add .` before the flow
- `--check` - Run lint and test scripts before committing
- `--amend` - Rewrite the last commit message with AI
- `--dry-run` - Preview suggested message without committing

**Examples:**
```bash
gemit commit --all          # Stage all + commit flow
gemit commit --check        # With lint/test validation
gemit commit --amend        # Rewrite last commit
gemit commit --dry-run      # Preview only
```

#### `gemit branch <description>`

Generate semantic branch name and optionally create it.

```bash
gemit branch "implement user authentication"
# Suggests: feat/implement-user-authentication

gemit branch "fix login bug with OAuth"
# Suggests: fix/login-bug-with-oauth
```

**Branch Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

#### `gemit pr`

Generate PR title and markdown description from branch commits.

```bash
gemit pr
```

Output includes:
- Conventional commit-style title
- Detailed description of changes
- List of commits included

#### `gemit log`

Summarize all work done in the current branch.

```bash
gemit log
```

#### `gemit changelog [name]`

Generate changelog file in `changelogs/<name>-YYYY-MM-DD.md`.

**Options:**
- `-c, --commits <number>` - Number of recent commits to include (default: 20, max: 200)

```bash
gemit changelog              # Default: 20 commits
gemit changelog v2.0.0 -c 50 # Custom name, 50 commits
```

### New Commands

#### `gemit undo`

Soft-reset the last commit, keeping files staged.

```bash
gemit undo
```

#### `gemit review`

AI code review of staged changes before committing.

```bash
git add .
gemit review
```

**Review Levels:**
- `[CRITICAL]` - Must fix before committing
- `[WARNING]` - Should review
- `[INFO]` - Suggestions for improvement
- `[OK]` - Looks good

#### `gemit stash`

Create stash with AI-generated descriptive message.

```bash
gemit stash
# Generates message based on working tree changes
# Runs: git stash push -u -m "<AI-generated-message>"
```

#### `gemit release <version>`

Complete release workflow: version bump → changelog → commit → tag.

```bash
gemit release 1.2.0
```

**What it does:**
1. Updates `package.json` version
2. Generates changelog with AI
3. Commits as `chore(release): v1.2.0`
4. Creates annotated git tag

#### `gemit ignore <description>`

Generate `.gitignore` entries based on project description.

```bash
gemit ignore "node project with typescript and jest"
gemit ignore "python project with django"
```

Automatically:
- Skips duplicate entries
- Appends to existing `.gitignore`
- Creates file if it doesn't exist

#### `gemit squash <count>`

Squash last N commits with unified AI-generated message.

```bash
gemit squash 3
# Squashes last 3 commits
# AI generates single conventional commit message
```

### Utility Commands

#### `gemit add [options]`

Stage changes and enter commit flow.

**Note:** Requires `--all` flag in practice.

```bash
gemit add --all         # git add . + commit flow
gemit add --all --check # With lint/test
```

#### `gemit doctor`

Validate configuration and report issues.

```bash
gemit doctor
```

Checks:
- Provider and model configuration
- API key presence
- Language setting
- Git repository status

#### `gemit update`

Force version check and install latest release.

```bash
gemit update
```

#### `gemit prompts`

Manage AI prompt templates.

```bash
gemit prompts                    # List status of all prompts
gemit prompts --init            # Export defaults to config folder
gemit prompts --edit commit     # Edit commit prompt
gemit prompts --show branch     # Display built-in template
```

#### `gemit config`

Manage configuration values.

```bash
gemit config --set KEY=value    # Update single value
gemit config --list             # Show all settings
```

### Global Options

```bash
gemit -v, --version    # Show version
gemit -h, --help       # Show help
gemit help <command>   # Command-specific help
```

## Advanced Usage

### 4-Step Commit Flow

When using `gemit commit --all`, you get a comprehensive workflow:

1. **Stage** - Automatically runs `git add .`
2. **Summary** - Shows what files changed
3. **AI Suggestion** - Generates conventional commit message
4. **Confirmation** - Review and confirm/edit before committing
5. **Push Prompt** - Asks if you want to push changes

### Lint and Test Integration

The `--check` flag integrates with your project's scripts:

```bash
gemit commit --check
```

**Runs (if present):**
1. `npm run lint --if-present`
2. `npm run test --if-present`

**In package.json:**
```json
{
  "scripts": {
    "lint": "eslint .",
    "test": "jest"
  }
}
```

If scripts don't exist, they're safely skipped due to `--if-present` flag.

## Prompt Customization

gemit works out of the box with built-in prompts. Customize only if you need specific AI behavior.

### How It Works

1. **No setup needed** - Built-in defaults always active
2. **Override globally** - Customize at OS config level (not per-project)
3. **Revert anytime** - Delete custom file to restore default

### Customizable Prompts

| Prompt | Template Variables |
|--------|-------------------|
| `commit.txt` | `{{detected_type}}`, `{{staged_files}}`, `{{summary}}`, `{{diff_stat}}`, `{{patch}}` |
| `branch.txt` | `{{description}}` |
| `pr.txt` | `{{branch_data}}` |
| `changelog.txt` | `{{commit_limit}}`, `{{commit_history}}` |
| `log.txt` | `{{branch_context}}` |

### Custom Prompt Location

- **Windows**: `%APPDATA%\gemit\prompts\`
- **macOS**: `~/Library/Application Support/gemit/prompts/`
- **Linux**: `~/.config/gemit/prompts/`

### Managing Prompts

```bash
# List all prompts and their status
gemit prompts

# Export all defaults to config folder
gemit prompts --init

# Edit specific prompt in default editor
gemit prompts --edit commit

# View built-in template
gemit prompts --show branch
```

## Troubleshooting

### Common Issues

#### "Not in a Git repository"

**Solution:** Ensure you're inside a Git-initialized directory:
```bash
git init
```

#### "API key not configured"

**Solution:** Run initialization or set key manually:
```bash
gemit init
# or
gemit config --set GOOGLE_API_KEY=your-key-here
```

#### "No staged changes"

**Solution:** Stage files before running gemit:
```bash
git add .
gemit
# or
gemit commit --all  # Auto-stages everything
```

#### Auto-update fails

**Solution:** Update manually:
```bash
npm install -g gemit-cli@latest
# or
gemit update
```

### Debugging

Enable verbose output:
```bash
DEBUG=* gemit commit
```

Check configuration:
```bash
gemit doctor
gemit config --list
```

---

## Contributing

Contributions are welcome! Here's how you can help:

### Reporting Issues

- Use [GitHub Issues](https://github.com/erickn-dev/gemit/issues)
- Include gemit version (`gemit -v`)
- Describe steps to reproduce
- Share relevant configuration (without API keys)

### Development Setup

```bash
# Clone repository
git clone https://github.com/erickn-dev/gemit.git
cd gemit

# Install dependencies
npm install

# Link for local testing
npm link

# Test changes
gemit doctor
```

### Pull Requests

1. Fork the repository
2. Create feature branch: `gemit branch "your feature"`
3. Make changes with conventional commits: `gemit commit --all`
4. Push and create PR: `gemit pr` (for PR text inspiration)

## Community

### Join the Discussion

Share improvements, ask questions, and follow updates:

- **Discord**: [Join Community](https://discord.gg/CJqy69MGD2)
- **Website**: [erickn-dev.github.io/gemit-site](https://erickn-dev.github.io/gemit-site/)

### Showcase

Using gemit in your project? Share your experience and get featured!

## License

[Check License](https://github.com/erickn-dev/gemit/blob/main/LICENSE)

---

## Acknowledgments

Built with ❤️ by [Erick Novaes](https://github.com/erickn-dev)

**AI Providers:**
- [Google Gemini](https://ai.google.dev/)
- [OpenAI](https://openai.com/)
- [Anthropic Claude](https://www.anthropic.com/)

---

<div align="center">

**[⬆ Back to Top](#gemit-cli)**

Made with Node.js • Powered by AI • Open Source

</div>