type Ticket = {
  id: string; number: number; title: string; description: string;
  priority: string; status: string; statusGroup: string; createdAt: string;
};

const form = document.querySelector<HTMLFormElement>('#form')!;
const list = document.querySelector<HTMLUListElement>('#list')!;
const msg = document.querySelector<HTMLParagraphElement>('#msg')!;
const more = document.querySelector<HTMLButtonElement>('#more')!;
let cursor: string | null = null;

function render(tickets: Ticket[], append: boolean) {
  if (!append) list.replaceChildren();
  if (!tickets.length && !append) {
    list.innerHTML = '<li class="empty">No tickets yet. Be the first to open one.</li>';
    return;
  }
  for (const t of tickets) {
    const li = document.createElement('li');
    const d = document.createElement('details');
    const s = document.createElement('summary');
    const num = Object.assign(document.createElement('span'), { className: 'num', textContent: `#${t.number}` });
    const title = Object.assign(document.createElement('span'), { className: 'title', textContent: t.title });
    const status = Object.assign(document.createElement('span'), {
      className: `status ${t.statusGroup}`, textContent: t.status,
    });
    s.append(num, title, status);
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = t.description || 'No details provided.';
    const meta = document.createElement('small');
    meta.textContent = `Priority: ${t.priority === 'none' ? 'not set' : t.priority} · Opened ${new Date(t.createdAt).toLocaleDateString()}`;
    body.append(meta);
    d.append(s, body);
    li.append(d);
    list.append(li);
  }
}

async function load(append = false) {
  try {
    const res = await fetch(`/api/tickets${append && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    cursor = data.next;
    more.hidden = !cursor;
    render(data.tickets, append);
  } catch {
    list.innerHTML = '<li class="empty">Could not load tickets. Refresh to try again.</li>';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  msg.className = ''; msg.textContent = '';
  if (!form.reportValidity()) return;
  btn.disabled = true;
  try {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Could not send ticket.');
    form.reset();
    msg.className = 'ok';
    msg.textContent = data.number ? `Ticket #${data.number} sent.` : 'Ticket sent.';
    await load();
  } catch (err) {
    msg.className = 'err';
    msg.textContent = err instanceof Error ? err.message : 'Could not send ticket.';
  } finally {
    btn.disabled = false;
  }
});

more.addEventListener('click', () => load(true));
load();