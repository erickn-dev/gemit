import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { style, ui } from './ui.js'

type AskConfirmationOptions = {
	defaultYes?: boolean
}

/*
 * Layout (lines printed after the question header):
 *
 *   [blank]                  ← separator between the question and options
 *     ● Yes                  ← option 1   (OPTION_LINES starts here)
 *     ○ No                   ← option 2
 *   [blank]                  ← breathing room
 *
 * OPTION_LINES = 3  (yes + no + blank)
 * PRE_OPTION_LINES = 2  (blank before yes + the question line itself)
 *   → from the cursor on yes to the question: 2 lines up
 */

const OPTION_LINES = 3
const PRE_OPTION_LINES = 2

function renderOptions(selectedYes: boolean, isUpdate: boolean): void {
	const yes = selectedYes
		? `    ${style('●', ui.cyan, ui.bold)} ${style('Yes', ui.cyan, ui.bold)}`
		: `    ${style('○', ui.gray)}  ${style('Yes', ui.gray)}`
	const no = !selectedYes
		? `    ${style('●', ui.cyan, ui.bold)} ${style('No', ui.cyan, ui.bold)}`
		: `    ${style('○', ui.gray)}  ${style('No', ui.gray)}`

	if (isUpdate) {
		output.write(`\x1b[${OPTION_LINES}A`)
	}

	output.write(`\r\x1b[2K${yes}\n`)
	output.write(`\r\x1b[2K${no}\n`)
	output.write(`\r\x1b[2K\n`)
}

export function askConfirmation(
	question: string,
	options: AskConfirmationOptions = {},
): Promise<boolean> {
	const cleanQuestion = question
		.replace(/\s*\(.*?\)\s*:?\s*$/, '')
		.replace(/:\s*$/, '')
		.trim()

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return new Promise((resolve) => {
			const rl = createInterface({ input, output })
			rl.question(question).then((answer) => {
				rl.close()
				const normalized = answer.trim().toLowerCase()
				resolve(normalized ? normalized === 'y' : Boolean(options.defaultYes))
			})
		})
	}

	return new Promise((resolve) => {
		let selectedYes = options.defaultYes !== false

		output.write(
			`\n  ${style('?', ui.yellow, ui.bold)} ${style(cleanQuestion, ui.bold)}  ${style('↑↓ · Enter', ui.gray, ui.dim)}\n`,
		)
		output.write(`\n`)
		renderOptions(selectedYes, false)

		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.setEncoding('utf8')

		function cleanup(result: boolean): void {
			process.stdin.setRawMode(false)
			process.stdin.pause()
			process.stdin.removeListener('data', onData)

			const chosen = result
				? `${style('●', ui.green, ui.bold)} ${style('Yes', ui.green, ui.bold)}`
				: `${style('●', ui.red, ui.bold)} ${style('No', ui.red, ui.bold)}`

			output.write(`\x1b[${OPTION_LINES + PRE_OPTION_LINES}A`)
			output.write(
				`\r\x1b[2K  ${style('✓', ui.green)} ${style(cleanQuestion, ui.dim)}  ${chosen}\n`,
			)
			output.write(`\n`)
			output.write(`\x1b[J`)

			resolve(result)
		}

		function onData(key: string): void {
			if (key === '\x03') {
				output.write('\n')
				process.exit(130)
			}

			if (key === '\x1b[A' || key === '\x1b[D') {
				selectedYes = true
				renderOptions(selectedYes, true)
				return
			}

			if (key === '\x1b[B' || key === '\x1b[C') {
				selectedYes = false
				renderOptions(selectedYes, true)
				return
			}

			if (key === ' ') {
				selectedYes = !selectedYes
				renderOptions(selectedYes, true)
				return
			}

			if (key === 'y' || key === 'Y') {
				cleanup(true)
				return
			}
			if (key === 'n' || key === 'N') {
				cleanup(false)
				return
			}

			if (key === '\r' || key === '\n') {
				cleanup(selectedYes)
				return
			}
		}

		process.stdin.on('data', onData)
	})
}

export async function askInput(question: string): Promise<string> {
	const rl = createInterface({ input, output })
	const answer = await rl.question(question)
	rl.close()
	return answer.trim()
}

export async function askEditableInput(
	question: string,
	defaultValue: string,
): Promise<string> {
	const rl = createInterface({ input, output })
	const answer = await rl.question(question)
	rl.close()
	const trimmed = answer.trim()
	if (!trimmed) {
		return defaultValue
	}
	return trimmed
}

function bumpVersion(current: string, type: 'patch' | 'minor' | 'major'): string {
	const parts = current.replace(/^v/, '').split('.')
	const major = Number(parts[0]) || 0
	const minor = Number(parts[1]) || 0
	const patch = Number(parts[2]?.split('-')[0]) || 0
	if (type === 'major') return `${major + 1}.0.0`
	if (type === 'minor') return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

type VersionOption = { label: string; value: string | null }

function renderVersionOptions(options: VersionOption[], selectedIdx: number, isUpdate: boolean): void {
	const count = options.length + 1
	if (isUpdate) {
		output.write(`\x1b[${count}A`)
	}
	for (let i = 0; i < options.length; i++) {
		const opt = options[i]
		const selected = i === selectedIdx
		const bullet = selected ? style('●', ui.cyan, ui.bold) : style('○', ui.gray)
		const styledLabel = selected
			? style(opt.label, ui.cyan, ui.bold)
			: style(opt.label, ui.dim)
		const label = opt.value
			? `${styledLabel}  ${style(opt.value, selected ? ui.cyan : ui.gray)}`
			: styledLabel
		output.write(`\r\x1b[2K    ${bullet}  ${label}\n`)
	}
	output.write(`\r\x1b[2K\n`)
}

export async function askVersionBump(currentVersion: string): Promise<string> {
	const isValidSemver = /^\d+\.\d+\.\d+/.test(currentVersion.replace(/^v/, ''))

	const options: VersionOption[] = isValidSemver
		? [
				{ label: 'patch', value: bumpVersion(currentVersion, 'patch') },
				{ label: 'minor', value: bumpVersion(currentVersion, 'minor') },
				{ label: 'major', value: bumpVersion(currentVersion, 'major') },
				{ label: 'custom', value: null },
			]
		: [{ label: 'custom', value: null }]

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		const rl = createInterface({ input, output })
		const answer = await rl.question('Enter new version: ')
		rl.close()
		return answer.trim()
	}

	return new Promise((resolve) => {
		let selectedIdx = 0

		output.write(
			`\n  ${style('?', ui.yellow, ui.bold)} ${style('Select new version', ui.bold)}  ${style(`current: ${currentVersion}`, ui.gray, ui.dim)}  ${style('↑↓ · Enter', ui.gray, ui.dim)}\n`,
		)
		output.write('\n')
		renderVersionOptions(options, selectedIdx, false)

		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.setEncoding('utf8')

		async function pickCustom(): Promise<void> {
			process.stdin.setRawMode(false)
			process.stdin.pause()
			process.stdin.removeListener('data', onData)

			output.write(`\x1b[${options.length + 1 + 2}A`)
			output.write(`\r\x1b[J`)

			const rl = createInterface({ input, output })
			const answer = await rl.question(`  ${style('→', ui.cyan)} Custom version: `)
			rl.close()
			resolve(answer.trim())
		}

		function cleanup(idx: number): void {
			process.stdin.setRawMode(false)
			process.stdin.pause()
			process.stdin.removeListener('data', onData)

			const chosen = options[idx]
			output.write(`\x1b[${options.length + 1 + 2}A`)
			output.write(
				`\r\x1b[2K  ${style('✓', ui.green)} ${style('New version', ui.dim)}  ${style(chosen.value ?? 'custom', ui.cyan, ui.bold)}\n`,
			)
			output.write(`\r\x1b[J`)

			resolve(chosen.value!)
		}

		function onData(key: string): void {
			if (key === '\x03') {
				output.write('\n')
				process.exit(130)
			}
			if (key === '\x1b[A' || key === '\x1b[D') {
				selectedIdx = (selectedIdx - 1 + options.length) % options.length
				renderVersionOptions(options, selectedIdx, true)
				return
			}
			if (key === '\x1b[B' || key === '\x1b[C') {
				selectedIdx = (selectedIdx + 1) % options.length
				renderVersionOptions(options, selectedIdx, true)
				return
			}
			if (key === '\r' || key === '\n') {
				if (options[selectedIdx].value === null) {
					pickCustom()
				} else {
					cleanup(selectedIdx)
				}
			}
		}

		process.stdin.on('data', onData)
	})
}
