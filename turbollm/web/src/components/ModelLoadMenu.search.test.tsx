import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelLoadMenu, SEARCH_MIN_CHOICES } from './ModelLoadMenu'
import type { LinkRecord } from '../lib/link-api'
import type { RemoteModelRow } from '../lib/remote-models'
import type { ModelEntry } from '../lib/types'

// The matching itself is proven in lib/remote-models.test.ts (filterModelGroups). This file
// proves the picker WIRES it up (issue #270): the box only appears on a long list, owns focus
// while the user types, and Enter picks what the user can see.

vi.mock('../lib/api', () => ({ track: () => {} }))

const NAMES = ['Gemma 27B', 'Gemma 12B', 'Qwen3 8B', 'Qwen3 35B', 'Llama 70B', 'Mistral 24B', 'Phi-4 14B', 'GLM Air', 'Granite Tiny']
const model = (name: string, quant = 'Q4_K_M') =>
  ({ key: `${name.toLowerCase()}|${quant}|1000`, name, quant, incomplete: false, parseError: null, loaded: false })
const MANY = NAMES.map((n) => model(n)) as unknown as ModelEntry[]

function link(over: Record<string, unknown>): LinkRecord {
  return {
    baseUrl: 'https://rig.trycloudflare.com',
    machineId: 'm1',
    machineIdChanged: false,
    grantedCapabilities: ['models:use'],
    linkApiVersion: 1,
    status: 'online',
    lastSeenAt: null,
    lastError: null,
    ...over,
  } as unknown as LinkRecord
}

const remote = (key: string, name: string, loaded: boolean): RemoteModelRow => ({
  linkId: 'l1',
  machine: 'workstation',
  model: { key, name, quant: 'Q4_K_M', nativeCtx: 8192, vision: false, loaded },
})

async function openMenu(props: Partial<Parameters<typeof ModelLoadMenu>[0]> = {}) {
  const onLoad = vi.fn()
  render(
    <ModelLoadMenu
      models={MANY}
      loadedKey={null}
      loadedName={null}
      onLoad={onLoad}
      onEject={() => {}}
      screen="chat"
      {...props}
    />,
  )
  await userEvent.click(screen.getByRole('button'))
  return { onLoad }
}

describe('ModelLoadMenu search (#270)', () => {
  it('shows no search box on a short list', async () => {
    await openMenu({ models: MANY.slice(0, SEARCH_MIN_CHOICES - 1) })
    expect(screen.queryByRole('textbox', { name: 'Search models' })).not.toBeInTheDocument()
  })

  it('focuses the box on open and filters as the user types', async () => {
    await openMenu()
    const box = screen.getByRole('textbox', { name: 'Search models' })
    await waitFor(() => expect(box).toHaveFocus())
    await userEvent.keyboard('qwen')
    expect(screen.getByText('Qwen3 8B')).toBeInTheDocument()
    expect(screen.getByText('Qwen3 35B')).toBeInTheDocument()
    expect(screen.queryByText('Gemma 27B')).not.toBeInTheDocument()
  })

  it("keeps focus in the box when a letter matches a menu item (Radix type-ahead)", async () => {
    // With a model loaded, "Eject model" is a real Radix item — unguarded, typing "e" would
    // jump focus onto it and the rest of the word would go nowhere.
    await openMenu({ loadedKey: MANY[0].key, loadedName: MANY[0].name })
    const box = screen.getByRole('textbox', { name: 'Search models' })
    await waitFor(() => expect(box).toHaveFocus())
    await userEvent.keyboard('e')
    await new Promise((r) => setTimeout(r, 20))
    expect(box).toHaveFocus()
    await userEvent.keyboard('mma')
    expect(box).toHaveValue('emma')
  })

  it('Enter loads the first pickable match, skipping a row that cannot be picked', async () => {
    const { onLoad } = await openMenu({
      links: [link({ id: 'l1', name: 'workstation', grantedCapabilities: ['models:use'] })],
      // Cold on a use-only link → disabled, and listed first.
      remoteModels: [remote('cold-70b', 'Cold 70B', false), remote('warm-8b', 'Warm 8B', true)],
    })
    await userEvent.keyboard('workstation{Enter}')
    expect(onLoad).toHaveBeenCalledWith('workstation/warm-8b')
  })

  it('says so when nothing matches, and clears the query when the menu closes', async () => {
    await openMenu()
    await userEvent.keyboard('nothing-like-this')
    expect(screen.getByText(/No models match/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveValue('')
    expect(screen.getByText('Gemma 27B')).toBeInTheDocument()
  })
})
