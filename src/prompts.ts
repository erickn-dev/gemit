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
