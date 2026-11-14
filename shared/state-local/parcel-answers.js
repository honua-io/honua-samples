(() => {
  const available = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const money = (value) => available(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value) : 'unavailable';
  const area = (value) => available(value) ? `${value.toFixed(3)} acres (${(Math.round(value * 43560 / 100) * 100).toLocaleString('en-US')} sq ft)` : 'area unavailable';

  function summarize(parcel) {
    const identifier = `TMK ${parcel.t9}`;
    return [
      { question: 'What are the assessed values?', answer: `${identifier}: land assessment ${money(parcel.land)}; building value ${money(parcel.bldg)}. These snapshot assessments are not a market valuation.` },
      { question: 'How large is this parcel?', answer: `${identifier}: ${area(parcel.acres)} in the mapped snapshot. Confirm surveyed boundaries before planning work.` },
      { question: 'What flood zone is mapped?', answer: `${identifier}: mapped flood zone ${parcel.fld || 'unavailable'}; ${area(parcel.acres)}. Verify the effective FIRM and site requirements with the County floodplain administrator.` },
    ];
  }

  class ParcelAnswers {
    constructor(root) {
      this.questions = document.createElement('div');
      this.questions.className = 'row wrap';
      this.questions.setAttribute('role', 'group');
      this.questions.setAttribute('aria-label', 'Suggested parcel questions');
      this.answer = document.createElement('p');
      this.answer.className = 'muted';
      this.answer.setAttribute('role', 'status');
      this.answer.setAttribute('aria-atomic', 'true');
      root.append(this.questions, this.answer);
    }

    update(parcel) {
      this.answer.textContent = '';
      this.questions.replaceChildren(...summarize(parcel).map((row) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn sm';
        button.textContent = row.question;
        button.addEventListener('click', () => { this.answer.textContent = row.answer; });
        return button;
      }));
    }
  }

  window.HonuaParcelAnswers = { summarize, mount: (root) => new ParcelAnswers(root) };
})();
