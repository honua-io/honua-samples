window.HonuaParcelSearch = function ({ input, list, parcels, streets, formatTmk, onParcel, onStreet }) {
  let matches = [], active = -1;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');

  function close() {
    list.dataset.open = 'false';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function choose(index) {
    const match = matches[index];
    if (!match) return;
    input.value = match.label;
    close();
    if (match.parcel) onParcel(match.parcel);
    else onStreet(match.label);
  }

  function option(match, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.id = `${list.id}-option-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.textContent = match.label;
    if (match.parcel) button.dataset.id = String(match.parcel.properties.id);
    else button.dataset.street = match.label;
    button.addEventListener('click', () => choose(index));
    return button;
  }

  function suggest() {
    close();
    const query = input.value.trim().toLowerCase(), digits = query.replace(/\D/g, '');
    if (!query) return;
    const parcelMatches = digits.length < 3 ? [] : parcels
      .filter((parcel) => String(parcel.properties.t9).includes(digits)).slice(0, 5)
      .map((parcel) => ({ parcel, label: `TMK ${formatTmk(parcel.properties.t9)}` }));
    matches = [...parcelMatches, ...streets.filter((street) => street.toLowerCase().includes(query))
      .slice(0, 4).map((label) => ({ label }))];
    list.replaceChildren(...matches.map(option));
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.setAttribute('aria-selected', 'false');
      empty.textContent = 'No matches in the loaded demo area';
      list.append(empty);
    }
    list.dataset.open = 'true';
    input.setAttribute('aria-expanded', 'true');
  }

  function move(direction) {
    if (list.dataset.open !== 'true') suggest();
    if (!matches.length || list.dataset.open !== 'true') return;
    active = active < 0 ? (direction > 0 ? 0 : matches.length - 1)
      : (active + direction + matches.length) % matches.length;
    Array.from(list.children).forEach((button, index) => button.setAttribute('aria-selected', String(index === active)));
    input.setAttribute('aria-activedescendant', list.children[active].id);
  }

  function keydown(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    }
    if (event.key === 'Enter' && list.dataset.open === 'true') {
      event.preventDefault();
      choose(active < 0 ? 0 : active);
    }
  }

  input.addEventListener('input', suggest);
  input.addEventListener('focus', suggest);
  input.addEventListener('keydown', keydown);
  document.addEventListener('click', (event) => {
    if (event.target !== input && !list.contains(event.target)) close();
  });
  close();
};
