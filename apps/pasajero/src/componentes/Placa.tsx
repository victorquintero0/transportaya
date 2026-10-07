/** La placa del carro, como la que se ve en la calle: amarilla con letras negras. Es lo primero que se mira para subirse. */
export function Placa({ placa, grande = false }: { placa: string; grande?: boolean }) {
  const limpia = placa.toUpperCase();
  const visible = limpia.length === 6 ? `${limpia.slice(0, 3)} ${limpia.slice(3)}` : limpia;
  return (
    <span
      aria-label={`Placa ${limpia}`}
      className={`inline-flex items-center rounded-lg border-[3px] border-black bg-[#ffd60a] font-black tracking-[0.12em] text-black shadow ${grande ? 'px-4 py-1.5 text-3xl' : 'px-2.5 py-0.5 text-lg'}`}
    >
      {visible}
    </span>
  );
}
