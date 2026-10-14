// 分配态编辑框里**真的改过**的字段。退出时存回去用（InstantAssign）。
//
// 原来在 ClickOutsideDeselect 里（那时退出是它管、要整页跳转）；退出改成在浏览器里当场完成之后
// 那个组件没了，这段收集逻辑留在这儿。

/**
 * 这个编辑框里**真的改过**的字段（值跟 data-original 不一样的）。没动过的不放进来。
 * 退出时存回去用；点下去当场画的那一份（InstantAssign）在服务端那份到之前就退出时也用它
 */
export function collectChangedEdits(block: Element | null): Record<string, string> {
  const customerNameInput = block?.querySelector<HTMLInputElement>('input[name="customer_name"]');
  const locationInput = block?.querySelector<HTMLInputElement>('input[name="location"]');
  const maleInput = block?.querySelector<HTMLInputElement>('input[name="male_count"]');
  const femaleInput = block?.querySelector<HTMLInputElement>('input[name="female_count"]');
  const amountInput = block?.querySelector<HTMLInputElement>('input[name="amount"]');
  const noteInput = block?.querySelector<HTMLInputElement>('input[name="note"]');
  const statusSelect = block?.querySelector<HTMLSelectElement>('select[name="status"]');

  const payload: Record<string, string> = {};
  if (
    customerNameInput &&
    customerNameInput.value.trim() &&
    customerNameInput.value !== customerNameInput.dataset.original
  ) {
    payload.customer_name = customerNameInput.value;
  }
  if (locationInput && locationInput.value !== locationInput.dataset.original) {
    payload.location = locationInput.value;
  }
  if (
    maleInput &&
    femaleInput &&
    (maleInput.value !== maleInput.dataset.original ||
      femaleInput.value !== femaleInput.dataset.original)
  ) {
    payload.male_count = maleInput.value;
    payload.female_count = femaleInput.value;
  }
  if (amountInput && amountInput.value !== amountInput.dataset.original) {
    payload.amount = amountInput.value;
  }
  // 备注框在窄色块上会被容器查询 display:none 掉（一列宽的单子塞不下）。
  // 藏起来的元素还在 DOM 里、照样能被 querySelector 找到，但既然点不进去也打不了字，
  // 它的 value 就等于 data-original，会被下面这个"只存改过的"判断自然跳过，
  // 不会把备注误清空。
  if (noteInput && noteInput.value !== noteInput.dataset.original) {
    payload.note = noteInput.value;
  }
  if (statusSelect && statusSelect.value !== statusSelect.dataset.original) {
    payload.status = statusSelect.value;
  }

  return payload;
}
