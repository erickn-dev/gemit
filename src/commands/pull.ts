import { execFileSync } from 'node:child_process'
import { createLLM, extractMessageText } from '../llm.js'
import { getCurrentBranch, getDefaultRemote, getUpstreamInfo } from '../git.js'
import {
	failAndExit,
	info,
	ok,
	section,
	style,
	ui,
	withProgress,
} from '../ui.js'

function getLLM() {
	try {
		return createLLM()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		failAndExit(message)
	}
}

function getHeadSha(): string {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: 'pipe' })
			.toString()
			.trim()
	} catch {
		failAndExit('Could not read HEAD SHA.')
	}
}

function runGitPull(remote: string, branch: string): void {
	try {
		execFileSync('git', ['pull', remote, branch], { stdio: 'inherit' })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		failAndExit(`git pull failed: ${message}`)
	}
}

const MAX_PATCH_CHARS = 20000

function getDiffSinceCommit(oldSha: string): {
	patch: string
	stat: string
	files: string
} {
	try {
		const stat = execFileSync(
			'git',
			['diff', '--stat', `${oldSha}..HEAD`],
			{ stdio: 'pipe' },
		)
			.toString()
			.trim()

		const files = execFileSync(
			'git',
			['diff', '--name-status', `${oldSha}..HEAD`],
			{ stdio: 'pipe' },
		)
			.toString()
			.trim()

		const patchRaw = execFileSync('git', ['diff', `${oldSha}..HEAD`], {
			stdio: 'pipe',
		})
			.toString()
			.trim()

		const truncated = patchRaw.length > MAX_PATCH_CHARS
		const patch = truncated
			? `${patchRaw.slice(0, MAX_PATCH_CHARS)}\n...(truncated)`
			: patchRaw

		return { patch, stat, files }
	} catch {
		return { patch: '', stat: '', files: '' }
	}
}

const PULL_ANALYSIS_PROMPT = `You are a senior software engineer analyzing code changes from a git pull.
Analyze the diff below and provide a structured summary focused on what changed and how to consume it.

Rules:
- Start with a brief summary of what changed (2-3 sentences max)
- Detect and list NEW or MODIFIED backend routes/endpoints (Express, NestJS, FastAPI, Flask, Spring Boot, Laravel, Rails, Hono, Elysia, Fastify, etc.)
  - For each route show: HTTP method, path, required headers (if auth detected), request body shape, response shape
- Detect new/changed DTOs, request types, validation schemas, environment variables
- Flag breaking changes: renamed fields, removed routes, changed required params, DB migrations
- If no routes/DTOs exist, summarize the changes concisely
- Be technical and actionable. No fluff.

Output format (use exactly these section headers):

## Summary
<2-3 sentence summary>

## New / Changed Endpoints
<list endpoints or write "None detected">

For each endpoint use:
  [METHOD] /path
  Headers: <required headers or "none">
  Body: <JSON example or "none">
  Response: <JSON example or shape>

## Breaking Changes
<list or "None">

## Other Changes
<config, env vars, migrations, deps, etc. — or "None">

Diff:
{{patch}}

Changed files:
{{files}}`

export async function pullAndAnalyze(): Promise<void> {
	const llm = getLLM()
	const branch = getCurrentBranch()

	const upstream = getUpstreamInfo()
	const remote = upstream?.remote ?? getDefaultRemote()

	if (!remote) {
		failAndExit('No remote configured. Add a remote first.')
	}

	section('PULL')
	console.log(`  ${info('Branch', branch)}`)
	console.log(`  ${info('Remote', remote)}`)
	console.log()

	const beforeSha = getHeadSha()

	runGitPull(remote, branch)

	const afterSha = getHeadSha()

	if (beforeSha === afterSha) {
		console.log()
		console.log(`  ${ok('Up to date')}  No new commits pulled.`)
		console.log()
		return
	}

	const { patch, stat, files } = getDiffSinceCommit(beforeSha)

	if (!patch) {
		console.log()
		console.log(`  ${ok('Pulled')}  No diff to analyze.`)
		console.log()
		return
	}

	section('CHANGES')
	console.log(style(stat, ui.dim))

	const prompt = PULL_ANALYSIS_PROMPT.replace('{{patch}}', patch).replace(
		'{{files}}',
		files,
	)

	const result = await withProgress('AI is analyzing the changes...', () =>
		llm.invoke(prompt),
	)
	const analysis = extractMessageText(result.content)

	if (!analysis) {
		failAndExit('Failed to analyze changes.')
	}

	section('ANALYSIS')
	const lines = analysis.split('\n')
	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed.startsWith('## ')) {
			console.log()
			console.log(
				`  ${style(trimmed.replace('## ', ''), ui.cyan, ui.bold)}`,
			)
		} else if (
			/^\[(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\]/.test(trimmed)
		) {
			console.log(`  ${style(trimmed, ui.green, ui.bold)}`)
		} else if (
			trimmed.startsWith('Headers:') ||
			trimmed.startsWith('Body:') ||
			trimmed.startsWith('Response:')
		) {
			console.log(`    ${style(trimmed, ui.dim)}`)
		} else if (trimmed) {
			console.log(`  ${trimmed}`)
		}
	}
	console.log()
}
