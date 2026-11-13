// Demo "processor": approves every checkout instantly and moves no money, so
// the whole site can be tried end to end. It is also the template to copy when
// adding a real processor (see index.js for what each function must do).

export function demo() {
  return {
    id: 'demo',
    mode: 'demo',
    label: 'Demo',
    async start() {
      return { status: 'paid', ref: 'demo' };
    },
  };
}
