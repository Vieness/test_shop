export const PRODUCT_COMPARISON_STORAGE_KEY = 'productComparisonItems';
export const PRODUCT_COMPARISON_STORAGE_EVENT = 'product-comparison:updated';
export const PRODUCT_COMPARISON_MAX_ITEMS = 4;

export class ProductComparisonStorage {
  static getItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCT_COMPARISON_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.productId) : [];
    } catch (_error) {
      return [];
    }
  }

  static saveItems(items) {
    try {
      localStorage.setItem(PRODUCT_COMPARISON_STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent(PRODUCT_COMPARISON_STORAGE_EVENT, { detail: { items } }));
    } catch (_error) {
      /* noop */
    }
  }

  static contains(productId) {
    return this.getItems().some((item) => item.productId === productId);
  }

  static addItem(payload) {
    const items = this.getItems();

    if (items.some((item) => item.productId === payload.productId)) {
      return { status: 'exists', items };
    }

    if (items.length >= PRODUCT_COMPARISON_MAX_ITEMS) {
      return { status: 'limit', items };
    }

    const currentGroupKey = items[0]?.compareGroup?.key;
    if (currentGroupKey && currentGroupKey !== payload.compareGroup?.key) {
      return {
        status: 'group_mismatch',
        items,
        currentGroupLabel: items[0]?.compareGroup?.label,
      };
    }

    items.unshift(payload);
    this.saveItems(items);

    return { status: 'added', items };
  }

  static removeItem(productId) {
    const items = this.getItems().filter((item) => item.productId !== productId);
    this.saveItems(items);
    return items;
  }

  static upsertItem(payload) {
    const items = this.getItems();
    const index = items.findIndex((item) => item.productId === payload.productId);

    if (index === -1) return;

    items[index] = payload;
    this.saveItems(items);
  }

  static clear() {
    this.saveItems([]);
  }
}
