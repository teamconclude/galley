import { useState } from 'react'
import type { InputHint } from '../../../shared/types'
import {
  blankItem,
  blockName,
  currentBlockKey,
  humanize,
  isRecord,
  labelsFor,
  newBlock,
  resolveField,
  summaryOf,
  type FieldSpec
} from '../lib/schema'
import { deleteAt, insertAt, moveItem, setValue, type Path } from '../lib/yamlEdit'
import { useEdit } from '../lib/contexts'
import {
  BooleanControl,
  ChoiceControl,
  ChoiceListControl,
  ImageControl,
  ListControl,
  NumberControl,
  TextControl
} from './Fields'
import { useSchemas } from '../lib/contexts'

interface FieldForProps {
  path: Path
  name: string
  spec: FieldSpec
  value: unknown
  inputs: Record<string, InputHint>
  placeholder?: string
}

export function FieldFor(props: FieldForProps): React.JSX.Element {
  const { path, name, spec, value, inputs, placeholder } = props
  const heading = <div className="field-heading">{humanize(name)}</div>
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
          <ObjectList
            path={path}
            items={Array.isArray(value) ? value : []}
            item={spec.item}
            fromBlueprint={spec.fromBlueprint}
            inputs={inputs}
          />
        </div>
      )
    case 'fields':
      return (
        <div className="field-wide">
          {heading}
          <div className="nested fields-grid">
            <ObjectFields
              path={path}
              obj={isRecord(value) ? value : {}}
              blueprint={spec.blueprint}
              inputs={inputs}
            />
          </div>
        </div>
      )
    default:
      return (
        <div className="field">
          <span className="field-name" title={inputs[name]?.comment}>
            {humanize(name)}
          </span>
          <Control path={path} spec={spec} value={value} placeholder={placeholder} />
        </div>
      )
  }
}

function Control({
  path,
  spec,
  value,
  placeholder
}: Omit<FieldForProps, 'name' | 'inputs'>): React.JSX.Element | null {
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
  blueprint: Record<string, unknown>
  inputs: Record<string, InputHint>
  skip?: string[]
}

// Blueprint fields first, in schema order, then anything else the page sets.
export function ObjectFields({
  path,
  obj,
  blueprint,
  inputs,
  skip = []
}: ObjectFieldsProps): React.JSX.Element {
  const keys = [...Object.keys(blueprint), ...Object.keys(obj).filter((k) => !(k in blueprint))]
  return (
    <>
      {keys
        .filter((key) => !skip.includes(key))
        .map((key) => (
          <FieldFor
            key={key}
            path={[...path, key]}
            name={key}
            spec={resolveField(key, blueprint[key], inputs, obj[key])}
            value={obj[key]}
            inputs={inputs}
            placeholder={typeof blueprint[key] === 'string' ? blueprint[key] : undefined}
          />
        ))}
    </>
  )
}

interface CardListProps {
  path: Path
  items: unknown[]
  titleOf: (item: unknown, index: number) => string
  bodyOf: (item: unknown, index: number) => React.ReactNode
  addControl: (insert: (value: unknown) => void) => React.ReactNode
}

// A list of collapsible cards with move, duplicate and delete. Open state follows the
// item through moves and deletes.
function CardList({ path, items, titleOf, bodyOf, addControl }: CardListProps): React.JSX.Element {
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
  return (
    <div className="block-list">
      {items.map((item, index) => {
        const isOpen = open.has(index)
        const summary = isRecord(item) ? summaryOf(item) : String(item ?? '')
        return (
          <div key={index} className={'block-card' + (isOpen ? ' open' : '')}>
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
              <span className="block-type">{titleOf(item, index)}</span>
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
            {isOpen && <div className="block-body fields-grid">{bodyOf(item, index)}</div>}
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
  return (
    <CardList
      path={path}
      items={items}
      titleOf={(item) => {
        const name = blockName(item)
        if (!name) return 'Block'
        return schemas.get(name)?.label ?? `Unknown block “${name}”`
      }}
      bodyOf={(item, index) => {
        const obj = isRecord(item) ? item : {}
        const name = blockName(obj)
        const schema = name === null ? undefined : schemas.get(name)
        return (
          <ObjectFields
            path={[...path, index]}
            obj={obj}
            blueprint={schema?.blueprint ?? {}}
            inputs={schema?.inputs ?? {}}
            skip={[currentBlockKey()]}
          />
        )
      }}
      addControl={(insert) => (
        <select
          value=""
          onChange={(e) => {
            const schema = schemas.get(e.target.value)
            if (schema) insert(newBlock(schema))
          }}
        >
          <option value="">Add block…</option>
          {choices.map((s) => (
            <option key={s.name} value={s.name} title={s.description}>
              {labels.get(s.name)}
            </option>
          ))}
        </select>
      )}
    />
  )
}

interface ObjectListProps {
  path: Path
  items: unknown[]
  item: Record<string, unknown>
  fromBlueprint: boolean
  inputs: Record<string, InputHint>
}

// Lists of plain items without a fieldGroup, such as accordion entries or pricing plans.
export function ObjectList({
  path,
  items,
  item,
  fromBlueprint,
  inputs
}: ObjectListProps): React.JSX.Element {
  return (
    <CardList
      path={path}
      items={items}
      titleOf={(_item, index) => `#${index + 1}`}
      bodyOf={(value, index) => (
        <ObjectFields
          path={[...path, index]}
          obj={isRecord(value) ? value : {}}
          blueprint={item}
          inputs={inputs}
        />
      )}
      addControl={(insert) => (
        <button onClick={() => insert(fromBlueprint ? structuredClone(item) : blankItem(item))}>
          Add item
        </button>
      )}
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
        <ObjectFields
          path={path}
          obj={value}
          blueprint={schema?.blueprint ?? {}}
          inputs={schema?.inputs ?? {}}
          skip={[currentBlockKey()]}
        />
      </div>
    </div>
  )
}
