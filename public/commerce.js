export const freeAt = 499;
export const deliveryFee = 35;
export const maxQuantity = 15;
export const pinPattern = /^[1-9][0-9]{5}$/;

export function quote(lines) {
  const subtotal = lines.reduce((amount, line) => amount + line.price * line.quantity, 0);
  const delivery = subtotal && subtotal < freeAt ? deliveryFee : 0;
  return {subtotal, delivery, total: subtotal + delivery};
}
