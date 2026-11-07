export const num = new Intl.NumberFormat('en-IN');
export const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const clock = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const money = v =>
  v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} crore` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} lakh` : inr.format(v);
