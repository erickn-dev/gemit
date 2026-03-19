# gemit-cli

CLI para sugerir mensagens de commit e nomes de branch com IA.

## Instalação

```bash
npm install -g gemit-cli
```

## Configuração (global)

O `gemit init` salva a configuração global, para funcionar em qualquer projeto.

- Windows: `%APPDATA%\gemit\.env`
- macOS: `~/Library/Application Support/gemit/.env`
- Linux: `$XDG_CONFIG_HOME/gemit/.env` ou `~/.config/gemit/.env`

```bash
gemit init
```

Opcionalmente, para usar `.env` local no projeto atual:

```bash
gemit init --local
```

## Comandos

### Ver versão

```bash
gemit -v
```

### Sugerir commit (padrão)

```bash
gemit
```

ou

```bash
gemit commit
```

Fluxo:

1. Mostra progresso da IA durante a requisição.
2. Sugere a mensagem de commit.
3. Pergunta se deve criar o commit.
4. Após o commit, pergunta se deve fazer `git push` (padrão `N`), detectando branch local e upstream remoto.

### Sugerir branch

```bash
gemit branch "descricao da feature"
```

### Diagnóstico de configuração

```bash
gemit doctor
```

## Variáveis de ambiente

```env
LLM_PROVIDER="google" # google | openai | anthropic
LLM_MODEL="gemini-2.5-flash"

GOOGLE_API_KEY=""
GEMINI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```
