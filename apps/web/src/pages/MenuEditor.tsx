import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, call, type Category, type MenuItem } from '../api';
import { ErrorText, Modal } from '../components';
import { brl, centsToInput, parseReais, priceLabel } from '../lib/format';
import { useMenu } from '../queries';

function useInvalidateMenu() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['menu'] });
}

export function MenuEditorPage() {
  const menu = useMenu(true);
  const invalidate = useInvalidateMenu();
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);

  const patchCat = useMutation({
    mutationFn: (v: { id: number; name?: string; position?: number; active?: boolean }) => {
      const { id, ...json } = v;
      return call(api.categories[':id'].$patch({ param: { id: String(id) }, json }));
    },
    onSuccess: invalidate,
  });
  const addCat = useMutation({
    mutationFn: (name: string) => call(api.categories.$post({ json: { name } })),
    onSuccess: (c) => (invalidate(), setSelected(c.id)),
  });

  const cats = menu.data ?? [];
  const current = cats.find((c) => c.id === selected) ?? cats[0];

  async function move(index: number, dir: -1 | 1) {
    const order = [...cats];
    const [c] = order.splice(index, 1);
    order.splice(index + dir, 0, c);
    // Renumber every category whose position changed (positions may have gaps).
    await Promise.all(
      order.map((cat, i) => (cat.position !== i ? patchCat.mutateAsync({ id: cat.id, position: i }) : null)),
    );
  }

  return (
    <div className="page">
      <h1>Cardápio</h1>
      <ErrorText error={menu.error ?? patchCat.error ?? addCat.error} />
      <div className="menu-editor">
        <section>
          <h2>Categorias</h2>
          <ul className="list">
            {cats.map((c, i) => (
              <li key={c.id} className={`list-row ${current?.id === c.id ? 'selected' : ''} ${c.active ? '' : 'inactive'}`}>
                <button className="link grow left" onClick={() => setSelected(c.id)}>
                  {c.name} <span className="muted small">({c.items.length})</span>
                </button>
                <button className="small-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${c.name}`}>
                  ↑
                </button>
                <button
                  className="small-btn"
                  disabled={i === cats.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Descer ${c.name}`}
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
          <NewCategory onAdd={(n) => addCat.mutate(n)} pending={addCat.isPending} />
        </section>

        {current && (
          <section>
            <CategoryHeader key={current.id} category={current} onSave={(v) => patchCat.mutate({ id: current.id, ...v })} />
            <ul className="list">
              {current.items.map((it) => (
                <li key={it.id} className={`list-row ${it.active ? '' : 'inactive'}`}>
                  <button className="link grow left item-btn" onClick={() => setEditing(it)}>
                    <span>
                      <strong>{it.name}</strong>
                      {!it.active && <span className="muted small"> (inativo)</span>}
                    </span>
                    {it.description && <span className="desc">{it.description}</span>}
                  </button>
                  <span className="amount small">
                    {priceLabel(it.variants.filter((v) => v.active))}
                  </span>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={() => setEditing('new')}>
              + Novo item
            </button>
          </section>
        )}
      </div>
      {editing && current && (
        <ItemDialog
          item={editing === 'new' ? null : editing}
          categories={cats}
          categoryId={current.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function NewCategory({ onAdd, pending }: { onAdd: (name: string) => void; pending: boolean }) {
  const [name, setName] = useState('');
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onAdd(name.trim());
        setName('');
      }}
    >
      <input className="grow" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
      <button disabled={!name.trim() || pending}>Adicionar</button>
    </form>
  );
}

function CategoryHeader({
  category,
  onSave,
}: {
  category: Category;
  onSave: (v: { name?: string; active?: boolean }) => void;
}) {
  const [name, setName] = useState(category.name);
  return (
    <div className="row wrap">
      <input
        className="grow title-input"
        aria-label="Nome da categoria"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== category.name && onSave({ name: name.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <label className="toggle">
        <input type="checkbox" checked={category.active} onChange={(e) => onSave({ active: e.target.checked })} />
        Ativa
      </label>
    </div>
  );
}

type VariantRow = { id?: number; name: string; price: string };

function ItemDialog({
  item,
  categories,
  categoryId,
  onClose,
}: {
  item: MenuItem | null;
  categories: Category[];
  categoryId: number;
  onClose: () => void;
}) {
  const invalidate = useInvalidateMenu();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [catId, setCatId] = useState(item?.categoryId ?? categoryId);
  const [active, setActive] = useState(item?.active ?? true);
  const [rows, setRows] = useState<VariantRow[]>(
    item
      ? item.variants.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name ?? '', price: centsToInput(v.priceCents) }))
      : [{ name: '', price: '' }],
  );
  const variants = rows.map((r) => ({ id: r.id, name: r.name.trim() || null, priceCents: parseReais(r.price) }));
  const valid = name.trim() && variants.length > 0 && variants.every((v) => v.priceCents !== null);

  const save = useMutation({
    mutationFn: () => {
      const vs = variants.map((v) => ({ ...v, priceCents: v.priceCents! }));
      const body = { categoryId: catId, name: name.trim(), description: description.trim() || null };
      return item
        ? call(api.items[':id'].$patch({ param: { id: String(item.id) }, json: { ...body, active, variants: vs } }))
        : call(api.items.$post({ json: { ...body, variants: vs } }));
    },
    onSuccess: () => (invalidate(), onClose()),
  });

  const setRow = (i: number, patch: Partial<VariantRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal title={item ? 'Editar item' : 'Novo item'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <label className="field">
          Nome
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          Descrição
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
        </label>
        <label className="field">
          Categoria
          <select value={catId} onChange={(e) => setCatId(Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {item && (
          <label className="toggle">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo (aparece na busca)
          </label>
        )}
        <fieldset className="stack">
          <legend>Preços</legend>
          <p className="muted small">Deixe o nome vazio para preço único. Ex.: "4 un", "Inteiro", "Meio".</p>
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="row">
              <input
                className="grow"
                placeholder="Nome (opcional)"
                aria-label="Nome da opção"
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
              <span className="money">
                <span>R$</span>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label="Preço"
                  value={r.price}
                  onChange={(e) => setRow(i, { price: e.target.value })}
                />
              </span>
              <button
                type="button"
                className="small-btn"
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label="Remover opção"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, { name: '', price: '' }])}>
            + Opção de preço
          </button>
        </fieldset>
        <ErrorText error={save.error} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="primary" disabled={!valid || save.isPending}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
