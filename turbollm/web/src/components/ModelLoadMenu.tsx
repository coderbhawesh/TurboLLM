import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, CircleSlash, Cloud, Cpu, Loader2, Search, SlidersHorizontal, Star } from 'lucide-react'
import type { ModelEntry } from '../lib/types'
import type { LinkRecord } from '../lib/link-api'
import { filterModelGroups, groupModelChoices, isFlat, type ModelChoice, type RemoteModelRow } from '../lib/remote-models'
import { usePinnedModels } from '../lib/usePinnedModels'
import { track } from '../lib/api'
import { Input } from './ui/input'
import { toast } from './ui/sonner'
import { cn } from '../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

/** The search box appears once the list is long enough to need it (issue #270). Below this,
 *  a box is just one more thing between the user and a short list they can already see. */
export const SEARCH_MIN_CHOICES = 8

/**
 * Model selector + eject control. Lists discovered models; selecting one loads it
 * (the engine auto-starts), and "Eject" stops the running engine. Shared by the
 * Chat and Models screens. Click the sliders icon (or Alt+click a row) to open its
 * config before loading. Long lists get a search box at the top; Enter picks the first match.
 */
export function ModelLoadMenu({
  models,
  loadedKey,
  loadedName,
  pending,
  ejecting,
  onLoad,
  onEject,
  onSettings,
  align = 'start',
  screen,
  blockedReason,
  links,
  remoteModels,
}: {
  models: ModelEntry[]
  loadedKey?: string | null
  loadedName?: string | null
  pending?: boolean
  ejecting?: boolean
  onLoad: (key: string) => void
  onEject: () => void
  onSettings?: (key: string) => void
  align?: 'start' | 'end'
  screen: 'chat' | 'code'
  /** When set, this control cannot change the model, and clicking it explains why instead of
   *  opening the list. For a harness whose model can only be chosen from INSIDE its own TUI
   *  (opencode) — offering a picker that silently does nothing is worse than not offering one. */
  blockedReason?: string
  /** Turbo Link (ADR-376 §6.3). Both optional and both absent on every install with no
   *  links — in which case the list renders exactly as it did before Turbo Link existed,
   *  flat and unheaded. Capability state comes from these records' host-reported
   *  `grantedCapabilities`, never from a local guess about what a link "probably" allows. */
  links?: LinkRecord[]
  remoteModels?: RemoteModelRow[]
}) {
  const { isPinned } = usePinnedModels()
  const [query, setQuery] = useState('')
  // Pinned models float to the top (same convention as the library list in ModelsScreen),
  // stable otherwise so unpinned order is unaffected.
  const loadable = models
    .filter((m) => !m.incomplete && !m.parseError)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const p = Number(isPinned(b.m.key)) - Number(isPinned(a.m.key))
      return p !== 0 ? p : a.i - b.i
    })
    .map(({ m }) => m)
  const label = ejecting ? 'Ejecting…' : (loadedName || (loadedKey ? 'Loaded model' : 'Load a model'))

  // All of the "which group, what does the user read, is this row pickable and why not"
  // logic lives in the PURE helper (lib/remote-models.ts) and is unit-tested there; this
  // component only renders what it returns.
  const groups = groupModelChoices({ local: loadable, links: links ?? [], remote: remoteModels ?? [] })
  const flat = isFlat(groups)
  const total = groups.reduce((n, g) => n + g.choices.length, 0)
  // Flat-vs-grouped is decided on the UNFILTERED list, so the layout does not jump between
  // the two as the user types.
  const showSearch = total >= SEARCH_MIN_CHOICES
  const shown = showSearch ? filterModelGroups(groups, query) : groups
  const noMatches = query.trim() !== '' && shown.length === 0

  function choose(choice: ModelChoice, altKey = false) {
    if (choice.disabled) { toast.info(choice.disabledReason!); return }
    if (altKey && onSettings && !choice.remote) { track(screen, 'open_model_load_settings'); onSettings(choice.id); return }
    // The QUALIFIED `<machine>/<model>` id for a remote choice — that is what the
    // router resolves on; the bare name above is display only.
    if (choice.id !== loadedKey) { track(screen, 'load_model'); onLoad(choice.id) }
  }

  function renderChoice(choice: ModelChoice) {
    const active = choice.id === loadedKey
    const pinned = !choice.remote && isPinned(choice.id)
    return (
      <div
        key={choice.id}
        role="menuitem"
        tabIndex={-1}
        aria-disabled={choice.disabled || undefined}
        // Deliberately NOT the `disabled` attribute, and never a bare grey row: a dead
        // control with no explanation sends the user hunting for a problem that isn't
        // there. The row stays clickable purely so the reason can be surfaced — the same
        // decision the trigger's `blockedReason` above already makes.
        title={choice.disabledReason}
        className={cn(
          'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none hover:bg-panel-2 focus:bg-panel-2',
          choice.disabled && 'cursor-not-allowed opacity-60',
        )}
        onClick={(e) => choose(choice, e.altKey)}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {active && <Check size={14} className="text-accent" />}
        </span>
        {pinned && <Star size={12} className="shrink-0 fill-current text-accent" />}
        {choice.remote && <Cloud size={13} className="shrink-0 text-muted" aria-label="On another machine" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{choice.name}</span>
          {choice.machine && <span className="truncate text-[11px] text-faint">{choice.machine}</span>}
          {choice.disabledReason && (
            <span className="truncate text-[11px]" style={{ color: 'var(--warn)' }}>{choice.disabledReason}</span>
          )}
        </span>
        {onSettings && !choice.remote && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              track(screen, 'open_model_load_settings')
              onSettings(choice.id)
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-panel hover:text-ink"
            title="Configure before loading"
            aria-label={`Configure ${choice.name} before loading`}
          >
            <SlidersHorizontal size={13} />
          </button>
        )}
        <span className="shrink-0 text-[11px] uppercase text-faint">
          {choice.quant}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setQuery('') }}>
      <DropdownMenuTrigger
        className={cn(
          'flex h-8 max-w-[160px] items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 text-[13px] text-ink transition-colors hover:border-[color:var(--accent)] disabled:opacity-60 md:max-w-[260px]',
          blockedReason && 'cursor-not-allowed opacity-60 hover:border-border',
        )}
        disabled={pending}
        // Deliberately NOT the `disabled` attribute: a disabled button fires no click, so the user
        // gets a dead control and no explanation. Blocking the open here keeps it clickable purely
        // so the reason can be surfaced.
        title={blockedReason}
        onPointerDown={blockedReason ? (e) => { e.preventDefault(); toast.info(blockedReason) } : undefined}
      >
        {pending || ejecting ? (
          <Loader2 size={14} className="animate-spin text-muted" />
        ) : (
          <Cpu size={14} className={loadedKey ? 'text-accent' : 'text-muted'} />
        )}
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-[60vh] w-[280px] overflow-y-auto">
        {showSearch && (
          // Sticky, and pulled over the content's own padding, so rows never scroll into view
          // above the box.
          <div className="sticky top-0 z-10 -mx-1 -mt-1 bg-panel p-1">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <Input
                // Radix only focuses the menu itself on open when focus is not already inside
                // it, so this wins — the user can just start typing.
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Radix's menu type-ahead listens on the content for single characters and
                  // moves focus to the first ITEM starting with them ("e" → "Eject model"),
                  // which would pull focus out of the box mid-word. Characters stay here;
                  // Escape and Tab still reach the menu.
                  if (e.key.length === 1) e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const first = shown.flatMap((g) => g.choices).find((c) => !c.disabled)
                    if (first) choose(first)
                  }
                }}
                placeholder="Search models…"
                aria-label="Search models"
                spellCheck={false}
                autoComplete="off"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
          </div>
        )}
        {noMatches ? (
          <div className="px-2 py-1.5 text-[11px] text-faint">No models match “{query.trim()}”.</div>
        ) : flat ? (
          <>
            <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
              {total ? 'Load a model' : 'No models found'}
            </div>
            {shown[0].choices.map(renderChoice)}
          </>
        ) : (
          shown.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
                {g.kind === 'machine' && <Cloud size={12} className="shrink-0" />}
                <span className="truncate">{g.label}</span>
              </div>
              {/* The link's own `lastError` — the actionable sentence — never a bare
                  "offline", the same rule the Turbo Link settings panel already follows. */}
              {g.note && (
                <div
                  className="flex items-start gap-1.5 px-2 pb-1.5 text-[11px]"
                  style={{ color: g.status === 'unknown' ? 'var(--muted)' : 'var(--warn)' }}
                >
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{g.note}</span>
                </div>
              )}
              {g.kind === 'local' && g.choices.length === 0 && (
                <div className="px-2 pb-1.5 text-[11px] text-faint">No local models found.</div>
              )}
              {g.choices.map(renderChoice)}
            </div>
          ))
        )}
        {loadedKey && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { track(screen, 'eject_model'); onEject() }} style={{ color: 'var(--err)' }}>
              <CircleSlash size={14} /> Eject model
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
