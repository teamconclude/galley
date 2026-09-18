import { useState } from 'react'
import type { FieldDef } from '../../../shared/types'
import {
  blankObject,
  blockName,
  currentListKey,
  fieldsFor,
  isRecord,
  labelsFor,
  newBlock,
  specFor,
  summaryOf,
  type FieldSpec
} from '../lib/schema'
import { deleteAt, insertAt, moveItem, setValue, type Path } from '../lib/yamlEdit'
import { useEdit } from '../lib/contexts'
import { showBlock } from '../lib/previewScroll'
import {
  BooleanControl,
  ChoiceControl,
  ChoiceListControl,
  ImageControl,
  ListControl,
  NumberControl,
  TextControl
} from './Fields'
import ContextMenu from './ContextMenu'
import Tip from './Tip'
import { useSchemas } from '../lib/contexts'

interface FieldForProps {
  path: Path
  def: FieldDef
  value: unknown
  // Page-level fields resolve outside the schema, e.g. to a picker from a data file.
  spec?: FieldSpec
}

export function FieldFor({ path, def, value, spec: given }: FieldForProps): React.JSX.Element {
  const spec = given ?? specFor(def)
  const heading = (
    <div className="field-heading" title={def.help}>
      {def.label}
    </div>
  )
  switch (spec.kind) {
    case 'blocks':
      return (
        <div className="field-wide">
          {heading}
          <BlockList path={path} items={Array.isArray(value) ? value : []} allowed={spec.allowed} />
        </div>
      )
    case 'block':
      return (
        <div className="field-wide">
          {heading}
          <SingleBlock path={path} value={value} component={spec.component} />
        </div>
      )
    case 'objects':
      return (
        <div className="field-wide">
          {heading}
          <ObjectList path={path} items={Array.isArray(value) ? value : []} fields={spec.fields} />
        </div>
      )
    case 'fields':
      return (
        <div className="field-wide">
          {heading}
          <div className="nested fields-grid">
            <ObjectFields path={path} obj={isRecord(value) ? value : {}} fields={spec.fields} />
          </div>
        </div>
      )
    default:
      return (
        <div className="field">
          <span className="field-name" title={def.help}>
            {def.label}
          </span>
          <Control path={path} spec={spec} value={value} placeholder={def.placeholder} />
        </div>
      )
  }
}

function Control({
  path,
  spec,
  value,
  placeholder
}: {
  path: Path
  spec: FieldSpec
  value: unknown
  placeholder?: string
}): React.JSX.Element | null {
  switch (spec.kind) {
    case 'string':
      return (
        <TextControl
          path={path}
          value={value}
          multiline={spec.multiline}
          markdown={spec.markdown}
          placeholder={placeholder}
        />
      )
    case 'image':
      return <ImageControl path={path} value={value} />
    case 'boolean':
      return <BooleanControl path={path} value={value} />
    case 'number':
      return <NumberControl path={path} value={value} />
    case 'choice':
      return <ChoiceControl path={path} value={value} choices={spec.choices} />
    case 'choicelist':
      return <ChoiceListControl path={path} value={value} options={spec.options} />
    case 'list':
      return <ListControl path={path} value={value} />
    default:
      return null
  }
}

interface ObjectFieldsProps {
  path: Path
  obj: Record<string, unknown>
  fields: FieldDef[]
}

// Declared fields first, in schema order, then anything else the page sets.
export function ObjectFields({ path, obj, fields }: ObjectFieldsProps): React.JSX.Element {
  return (
    <>
      {fieldsFor(fields, obj).map((def) => (
        <FieldFor key={def.key} path={[...path, def.key]} def={def} value={obj[def.key]} />
      ))}
    </>
  )
}

interface CardListProps {
  path: Path
  items: unknown[]
  titleOf: (item: unknown, index: number) => string
  // What this kind of item is for, shown in the open card and on hover.
  describe?: (item: unknown) => string | undefined
  bodyOf: (item: unknown, index: number) => React.ReactNode
  addControl: (insert: (value: unknown) => void) => React.ReactNode
}

// A list of collapsible cards with move, duplicate and delete. Open state follows the
// item through moves and deletes.
function CardList(props: CardListProps): React.JSX.Element {
  const { path, items, titleOf, describe, bodyOf, addControl } = props
  const edit = useEdit()
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const remap = (fn: (i: number) => number | null): void =>
    setOpen((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        const j = fn(i)
        if (j !== null) next.add(j)
      }
      return next
    })
  const move = (from: number, to: number): void => {
    edit((doc) => moveItem(doc, path, from, to))
    remap((i) => (i === from ? to : i === to ? from : i))
  }
  const remove = (index: number): void => {
    if (!window.confirm('Delete this block?')) return
    edit((doc) => deleteAt(doc, [...path, index]))
    remap((i) => (i === index ? null : i > index ? i - 1 : i))
  }
  const insert = (index: number, value: unknown): void => {
    edit((doc) => insertAt(doc, path, index, value))
    remap((i) => (i >= index ? i + 1 : i))
    setOpen((prev) => new Set(prev).add(index))
  }
  // The preview follows the page's top-level blocks; a nested list belongs to the block
  // its path starts in.
  const topLevel = (index: number): number | null =>
    path[0] !== currentListKey() ? null : path.length === 1 ? index : Number(path[1])
  const follow = (index: number): void => {
    const top = topLevel(index)
    if (top !== null && !Number.isNaN(top)) showBlock(top)
  }
  return (
    <div className="block-list">
      {items.map((item, index) => {
        const isOpen = open.has(index)
        const summary = isRecord(item) ? summaryOf(item) : String(item ?? '')
        const description = describe?.(item)
        return (
          <div
            key={index}
            className={'block-card' + (isOpen ? ' open' : '')}
            onMouseDownCapture={() => follow(index)}
          >
            <div
              className="block-head"
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev)
                  if (next.has(index)) next.delete(index)
                  else next.add(index)
                  return next
                })
              }
            >
              <span className="tree-arrow">{isOpen ? '▾' : '▸'}</span>
              {description ? (
                <Tip text={description}>
                  <span className="block-type">{titleOf(item, index)}</span>
                </Tip>
              ) : (
                <span className="block-type">{titleOf(item, index)}</span>
              )}
              <span className="block-summary">{summary}</span>
              <span className="block-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  title="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </button>
                <button title="Duplicate" onClick={() => insert(index + 1, structuredClone(item))}>
                  ⧉
                </button>
                <button title="Delete" onClick={() => remove(index)}>
                  ✕
                </button>
              </span>
            </div>
            {isOpen && (
              <div className="block-body fields-grid">
                {description && <p className="block-description">{description}</p>}
                {bodyOf(item, index)}
              </div>
            )}
          </div>
        )
      })}
      <div className="block-add">{addControl((value) => insert(items.length, value))}</div>
    </div>
  )
}

interface BlockListProps {
  path: Path
  items: unknown[]
  allowed: string[] | null
}

export function BlockList({ path, items, allowed }: BlockListProps): React.JSX.Element {
  const { schemas, standalone } = useSchemas()
  const choices = allowed ? allowed.flatMap((name) => schemas.get(name) ?? []) : standalone
  const labels = labelsFor(choices)
  const [menu, setMenu] = useState<{ x: number; y: number; insert: (v: unknown) => void } | null>(
    null
  )
  return (
    <CardList
      path={path}
      items={items}
      titleOf={(item) => {
        const name = blockName(item)
        if (!name) return 'Block'
        return schemas.get(name)?.label ?? `Unknown block “${name}”`
      }}
      describe={(item) => {
        const name = blockName(item)
        return (name && schemas.get(name)?.description) || undefined
      }}
      bodyOf={(item, index) => {
        const obj = isRecord(item) ? item : {}
        const name = blockName(obj)
        const schema = name === null ? undefined : schemas.get(name)
        return <ObjectFields path={[...path, index]} obj={obj} fields={schema?.fields ?? []} />
      }}
      addControl={(insert) => (
        <>
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.left, y: r.bottom + 4, insert })
            }}
          >
            Add block…
          </button>
          {menu && (
            <ContextMenu
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
              items={choices.map((s) => ({
                label: labels.get(s.name) ?? s.name,
                description: s.description || undefined,
                onClick: () => menu.insert(newBlock(s))
              }))}
            />
          )}
        </>
      )}
    />
  )
}

interface ObjectListProps {
  path: Path
  items: unknown[]
  fields: FieldDef[]
}

// Lists of plain objects that are not blocks, such as accordion entries or pricing plans.
export function ObjectList({ path, items, fields }: ObjectListProps): React.JSX.Element {
  return (
    <CardList
      path={path}
      items={items}
      titleOf={(_item, index) => `#${index + 1}`}
      bodyOf={(value, index) => (
        <ObjectFields path={[...path, index]} obj={isRecord(value) ? value : {}} fields={fields} />
      )}
      addControl={(insert) => <button onClick={() => insert(blankObject(fields))}>Add item</button>}
    />
  )
}

interface SingleBlockProps {
  path: Path
  value: unknown
  component: string
}

export function SingleBlock({ path, value, component }: SingleBlockProps): React.JSX.Element {
  const edit = useEdit()
  const { schemas } = useSchemas()
  const schema = schemas.get(component)
  const label = schema?.label ?? component
  if (!isRecord(value)) {
    return (
      <div className="block-add">
        <button
          disabled={!schema}
          onClick={() => schema && edit((doc) => setValue(doc, path, newBlock(schema)))}
        >
          Add {label.toLowerCase()}
        </button>
      </div>
    )
  }
  return (
    <div className="block-card open">
      <div className="block-head static">
        <span className="block-type">{label}</span>
        <span className="block-summary">{summaryOf(value)}</span>
        <span className="block-actions">
          <button
            title="Remove"
            onClick={() =>
              window.confirm(`Remove the ${label.toLowerCase()}?`) &&
              edit((doc) => deleteAt(doc, path))
            }
          >
            ✕
          </button>
        </span>
      </div>
      <div className="block-body fields-grid">
        <ObjectFields path={path} obj={value} fields={schema?.fields ?? []} />
      </div>
    </div>
  )
}
