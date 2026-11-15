class ParcelSearch {
  constructor({ input, list, parcels, streets, formatTmk, onParcel, onStreet }) {
    Object.assign(this, { input, list, parcels, streets, formatTmk, onParcel, onStreet });
    this.matches = [];
    this.active = -1;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    list.setAttribute('role', 'listbox');
    input.addEventListener('input', () => this.suggest());
    input.addEventListener('focus', () => this.suggest());
    input.addEventListener('keydown', (event) => this.keydown(event));
    document.addEventListener('click', (event) => {
      if (event.target !== input && !list.contains(event.target)) this.close();
    });
    this.close();
  }

  close() {
    this.list.dataset.open = 'false';
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    this.active = -1;
  }

  choose(index) {
    const match = this.matches[index];
    if (!match) return;
    this.input.value = match.label;
    this.input.focus();
    this.close();
    if (match.parcel) this.onParcel(match.parcel);
    else this.onStreet(match.label);
  }

  option(match, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.id = `${this.list.id}-option-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.textContent = match.label;
    if (match.parcel) button.dataset.id = String(match.parcel.properties.id);
    else button.dataset.street = match.label;
    button.addEventListener('click', () => this.choose(index));
    return button;
  }

  suggest() {
    this.close();
    const query = this.input.value.trim().toLowerCase(), digits = query.replace(/\D/g, '');
    if (!query) return;
    const parcelMatches = digits.length < 3 ? [] : this.parcels
      .filter((parcel) => String(parcel.properties.t9).includes(digits)).slice(0, 5)
      .map((parcel) => ({ parcel, label: `TMK ${this.formatTmk(parcel.properties.t9)}` }));
    this.matches = [...parcelMatches, ...this.streets.filter((street) => street.toLowerCase().includes(query))
      .slice(0, 4).map((label) => ({ label }))];
    this.list.replaceChildren(...this.matches.map((match, index) => this.option(match, index)));
    if (!this.matches.length) {
      const empty = document.createElement('div');
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.setAttribute('aria-selected', 'false');
      empty.textContent = 'No matches in the loaded demo area';
      this.list.append(empty);
    }
    this.list.dataset.open = 'true';
    this.input.setAttribute('aria-expanded', 'true');
  }

  move(direction) {
    if (this.list.dataset.open !== 'true') this.suggest();
    if (!this.matches.length || this.list.dataset.open !== 'true') return;
    this.active = this.active < 0 ? (direction > 0 ? 0 : this.matches.length - 1)
      : (this.active + direction + this.matches.length) % this.matches.length;
    Array.from(this.list.children).forEach((button, index) => button.setAttribute('aria-selected', String(index === this.active)));
    this.input.setAttribute('aria-activedescendant', this.list.children[this.active].id);
  }

  keydown(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.move(event.key === 'ArrowDown' ? 1 : -1);
    }
    if (event.key === 'Enter' && this.list.dataset.open === 'true') {
      event.preventDefault();
      this.choose(this.active < 0 ? 0 : this.active);
    }
  }

}

window.HonuaParcelSearch = (options) => new ParcelSearch(options);
