export class Inserter {
  constructor(ranking, id) {
    this.ranking = ranking;
    this.id = id;
    this.low = 0;
    this.high = ranking.length;
  }

  get midpoint() {
    return Math.floor((this.low + this.high) / 2);
  }

  get done() {
    return this.low === this.high;
  }

  next() {
    return this.ranking[this.midpoint];
  }

  answer(better) {
    if (this.done) return;
    if (better) this.high = this.midpoint;
    else this.low = this.midpoint + 1;
  }

  tie() {
    if (!this.done) this.low = this.high = this.midpoint + 1;
  }

  result() {
    return [...this.ranking.slice(0, this.low), this.id, ...this.ranking.slice(this.low)];
  }
}
