// Enhance a native select while retaining it as the source of selection events.
class PatternPicker {
  constructor(select, thumbnail) {
    this.select = select;
    this.root = document.createElement('div');
    this.root.className = 'pattern-picker';
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.id = `${select.id}-trigger`;
    this.trigger.className = 'pattern-picker-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    this.list = document.createElement('div');
    this.list.id = `${select.id}-options`;
    this.list.className = 'pattern-picker-list';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Pattern');
    this.list.hidden = true;
    this.trigger.setAttribute('aria-controls', this.list.id);
    this.options = Array.from(select.options, option => {
      const item = document.createElement('div');
      item.className = 'pattern-picker-option';
      item.setAttribute('role', 'option');
      item.tabIndex = -1;
      item.dataset.value = option.value;
      const swatch = document.createElement('span');
      swatch.className = 'pattern-picker-swatch';
      swatch.innerHTML = thumbnail(option.value);
      const text = document.createElement('span');
      text.className = 'pattern-picker-text';
      const [name, description] = option.textContent.split(' / ');
      const title = document.createElement('strong');
      title.textContent = name;
      const subtitle = document.createElement('small');
      subtitle.textContent = description;
      text.append(title, subtitle);
      const check = document.createElement('span');
      check.className = 'pattern-picker-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      item.append(swatch, text, check);
      item.addEventListener('click', () => this.choose(item));
      return item;
    });
    this.list.append(...this.options);
    this.root.append(this.trigger, this.list);
    select.after(this.root);
    select.hidden = true;
    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) label.htmlFor = this.trigger.id;
    this.sync();
    this.trigger.addEventListener('click', () => this.list.hidden ? this.open() : this.close());
    this.trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        this.open(event.key === 'Home' ? 0 : event.key === 'End' ? this.options.length - 1 : undefined);
      }
    });
    this.list.addEventListener('keydown', event => this.onKey(event));
    document.addEventListener('pointerdown', event => {
      if (!this.root.contains(event.target)) this.close(false);
    });
    this.root.addEventListener('focusout', event => {
      if (!this.root.contains(event.relatedTarget)) this.close(false);
    });
    window.addEventListener('resize', () => this.close(false));
    document.addEventListener('scroll', event => {
      if (!this.list.contains(event.target)) this.close(false);
    }, true);
  }

  setAllowedValues(values) {
    this.options.forEach((item, index) => {
      item.hidden = values !== null && !values.includes(item.dataset.value);
      this.select.options[index].disabled = item.hidden;
    });
  }

  sync() {
    const selected = this.options.find(item => item.dataset.value === this.select.value);
    this.options.forEach(item => item.setAttribute('aria-selected', String(item === selected)));
    this.trigger.replaceChildren(...Array.from(selected.children).slice(0, 2).map(child => child.cloneNode(true)));
    const arrow = document.createElement('span');
    arrow.className = 'pattern-picker-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '⌄';
    this.trigger.append(arrow);
    this.trigger.setAttribute('aria-label', `Pattern: ${this.select.selectedOptions[0].textContent}`);
  }

  open(index = this.select.selectedIndex) {
    const rect = this.trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const height = Math.min(360, Math.max(below, above));
    this.list.style.width = `${Math.min(Math.max(rect.width, 280), window.innerWidth - 24)}px`;
    this.list.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - parseFloat(this.list.style.width) - 12))}px`;
    this.list.style.maxHeight = `${height}px`;
    this.list.style.top = below >= Math.min(360, above) ? `${rect.bottom + 6}px` : 'auto';
    this.list.style.bottom = below >= Math.min(360, above) ? 'auto' : `${window.innerHeight - rect.top + 6}px`;
    this.list.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.focusOption(index);
  }

  focusOption(index) {
    if (this.options[index]?.hidden) index = this.options.findIndex(item => !item.hidden);
    this.options[index].focus({ preventScroll: true });
    this.options[index].scrollIntoView({ block: 'nearest' });
  }

  close(restoreFocus = true) {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.trigger.focus({ preventScroll: true });
  }

  choose(item) {
    if (!item || item.hidden) return;
    this.select.value = item.dataset.value;
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this.close();
  }

  onKey(event) {
    const options = this.options.filter(item => !item.hidden);
    const index = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (event.key === 'Tab') { this.close(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.choose(options[index]);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.search = (Date.now() - (this.searchTime || 0) < 700 ? this.search || '' : '') + event.key.toLowerCase();
      this.searchTime = Date.now();
      next = options.findIndex(item => item.querySelector('strong').textContent.toLowerCase().startsWith(this.search));
      if (next < 0) next = undefined;
    }
    if (next !== undefined) { event.preventDefault(); this.focusOption(this.options.indexOf(options[next])); }
  }
}
