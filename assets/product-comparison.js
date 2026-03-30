import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

const STORAGE_KEY = 'productComparisonItems';
const STORAGE_EVENT = 'product-comparison:updated';
const MAX_ITEMS = 4;
const GROUP_ORDER = {
  primary: 0,
  secondary: 1,
};

class ProductComparisonStorage {
  static getItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.productId) : [];
    } catch (_error) {
      return [];
    }
  }

  static saveItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { items } }));
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

    if (items.length >= MAX_ITEMS) {
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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatPrice(value, format, currency) {
  if (typeof value !== 'number') return '';
  return formatMoney(value, format, currency);
}

function getVariantImage(resource) {
  return (
    resource?.featured_media?.preview_image?.src ||
    resource?.featured_image?.src ||
    resource?.image ||
    ''
  );
}

class ProductCompareToggle extends Component {
  requiredRefs = ['toggleButton', 'count', 'message'];
  #payload;
  #abortController = new AbortController();

  connectedCallback() {
    super.connectedCallback();

    this.#payload = this.#readPayload();
    if (!this.#payload) return;

    const { signal } = this.#abortController;
    this.refs.toggleButton.addEventListener('click', this.#handleClick, { signal });
    window.addEventListener(STORAGE_EVENT, this.#syncState, { signal });
    window.addEventListener('storage', this.#syncState, { signal });

    const closestSection = this.closest('.shopify-section, dialog');
    closestSection?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });

    this.#syncState();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
  }

  #readPayload() {
    const source = this.querySelector('[data-compare-product-json]');
    if (!(source instanceof HTMLScriptElement)) return null;

    try {
      return JSON.parse(source.textContent || '');
    } catch (_error) {
      return null;
    }
  }

  #handleVariantUpdate = (event) => {
    if (!this.#payload || !event.detail.resource) return;

    this.#payload.variant = {
      ...this.#payload.variant,
      id: event.detail.resource.id || this.#payload.variant.id,
      price: event.detail.resource.price ?? this.#payload.variant.price,
      compareAtPrice: event.detail.resource.compare_at_price ?? this.#payload.variant.compareAtPrice,
      available: event.detail.resource.available ?? this.#payload.variant.available,
      image: getVariantImage(event.detail.resource) || this.#payload.variant.image,
    };

    if (ProductComparisonStorage.contains(this.#payload.productId)) {
      ProductComparisonStorage.upsertItem(this.#payload);
    }
  };

  #handleClick = () => {
    if (!this.#payload) return;

    const isActive = ProductComparisonStorage.contains(this.#payload.productId);
    if (isActive) {
      ProductComparisonStorage.removeItem(this.#payload.productId);
      this.refs.message.textContent = '';
      return;
    }

    const result = ProductComparisonStorage.addItem(this.#payload);
    if (result.status === 'limit') {
      this.refs.message.textContent = this.dataset.limitMessage || '';
      return;
    }

    if (result.status === 'group_mismatch') {
      const label = result.currentGroupLabel ? ` ${result.currentGroupLabel}` : '';
      this.refs.message.textContent = `${this.dataset.groupMessage || ''}${label}`.trim();
      return;
    }

    this.refs.message.textContent = '';
  };

  #syncState = () => {
    if (!this.#payload) return;

    const items = ProductComparisonStorage.getItems();
    const isActive = items.some((item) => item.productId === this.#payload.productId);
    const comparePageUrl = this.dataset.comparePageUrl || '/pages/compare';
    const addLabel = this.dataset.addLabel || 'Compare';
    const removeLabel = this.dataset.removeLabel || 'Added';
    const countLabel = this.dataset.countLabel || 'Items in comparison';
    const viewLabel = this.dataset.viewLabel || 'Open comparison';

    this.refs.toggleButton.dataset.active = String(isActive);
    this.refs.toggleButton.setAttribute('aria-pressed', String(isActive));
    this.refs.toggleButton.querySelector('[data-compare-label]')?.replaceChildren(
      document.createTextNode(isActive ? removeLabel : addLabel)
    );

    this.refs.count.textContent = `${countLabel}: ${items.length}/${MAX_ITEMS}`;

    const viewLink = this.querySelector('[data-compare-link]');
    if (viewLink instanceof HTMLAnchorElement) {
      viewLink.href = comparePageUrl;
      viewLink.textContent = viewLabel;
    }

    if (!isActive) {
      this.refs.message.textContent = '';
    }
  };
}

class ProductComparisonPage extends Component {
  requiredRefs = ['count', 'emptyState', 'content', 'cards', 'groups'];
  #abortController = new AbortController();

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#abortController;
    window.addEventListener(STORAGE_EVENT, this.renderComparison, { signal });
    window.addEventListener('storage', this.renderComparison, { signal });
    this.refs.clearButton?.addEventListener('click', this.clearComparison, { signal });

    this.renderComparison();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
  }

  clearComparison = () => {
    ProductComparisonStorage.clear();
  };

  renderComparison = () => {
    const items = ProductComparisonStorage.getItems().slice(0, MAX_ITEMS);
    const empty = items.length === 0;

    this.refs.count.textContent = `${this.dataset.countLabel || 'Selected products'}: ${items.length}/${MAX_ITEMS}`;
    this.refs.emptyState.hidden = !empty;
    this.refs.content.hidden = empty;
    if (this.refs.clearButton instanceof HTMLElement) {
      this.refs.clearButton.toggleAttribute('hidden', empty);
    }

    if (empty) {
      this.refs.cards.replaceChildren();
      this.refs.groups.replaceChildren();
      return;
    }

    this.#renderCards(items);
    this.#renderSpecs(items);
  };

  #renderCards(items) {
    const template = this.querySelector('[data-compare-card-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const fragment = document.createDocumentFragment();
    const comparePageUrl = this.dataset.comparePageUrl || '/pages/compare';

    for (const item of items) {
      const node = template.content.firstElementChild?.cloneNode(true);
      if (!(node instanceof HTMLElement)) continue;

      const currentPrice = formatPrice(item.variant?.price, item.moneyFormat, item.currencyCode);
      const compareAtPrice = formatPrice(item.variant?.compareAtPrice, item.moneyFormat, item.currencyCode);
      const hasDiscount =
        typeof item.variant?.compareAtPrice === 'number' &&
        typeof item.variant?.price === 'number' &&
        item.variant.compareAtPrice > item.variant.price;

      const link = node.querySelector('[data-product-link]');
      if (link instanceof HTMLAnchorElement) {
        link.href = item.url || comparePageUrl;
      }

      const image = node.querySelector('[data-product-image]');
      if (image instanceof HTMLImageElement) {
        image.src = item.variant?.image || '';
        image.alt = item.title || '';
      }

      const title = node.querySelector('[data-product-title]');
      if (title) title.textContent = item.title || '';

      const price = node.querySelector('[data-product-price]');
      if (price) price.textContent = currentPrice;

      const compare = node.querySelector('[data-product-compare-price]');
      if (compare) {
        compare.textContent = hasDiscount ? compareAtPrice : '';
        compare.toggleAttribute('hidden', !hasDiscount);
      }

      const description = node.querySelector('[data-product-description]');
      if (description) description.textContent = item.description || '';

      const removeButton = node.querySelector('[data-remove-product]');
      if (removeButton instanceof HTMLButtonElement) {
        removeButton.addEventListener('click', () => ProductComparisonStorage.removeItem(item.productId));
      }

      fragment.append(node);
    }

    for (let index = items.length; index < MAX_ITEMS; index += 1) {
      const slot = document.createElement('div');
      slot.className = 'product-comparison__slot';
      slot.textContent = this.dataset.emptySlotLabel || 'Select one more product';
      fragment.append(slot);
    }

    this.refs.cards.replaceChildren(fragment);
  }

  #renderSpecs(items) {
    const template = this.querySelector('[data-compare-row-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const specs = this.#collectSpecs(items);
    const fragment = document.createDocumentFragment();

    let currentGroupKey = '';
    for (const spec of specs) {
      if (spec.groupKey !== currentGroupKey) {
        currentGroupKey = spec.groupKey;
        if (spec.groupLabel) {
          const heading = document.createElement('h3');
          heading.className = 'product-comparison__group-title';
          heading.textContent = spec.groupLabel;
          fragment.append(heading);
        }
      }

      const row = template.content.firstElementChild?.cloneNode(true);
      if (!(row instanceof HTMLElement)) continue;

      const label = row.querySelector('[data-spec-label]');
      if (label) label.textContent = spec.label;

      const values = row.querySelector('[data-spec-values]');
      if (!(values instanceof HTMLElement)) continue;

      for (const item of items) {
        const valueCell = document.createElement('div');
        valueCell.className = 'product-comparison__spec-value';
        const value = spec.values.get(item.productId);
        if (!normalizeText(value)) {
          valueCell.classList.add('product-comparison__spec-value--empty');
          valueCell.textContent = this.dataset.emptyValueLabel || '—';
        } else {
          valueCell.textContent = value;
        }
        values.append(valueCell);
      }

      for (let index = items.length; index < MAX_ITEMS; index += 1) {
        const valueCell = document.createElement('div');
        valueCell.className = 'product-comparison__spec-value product-comparison__spec-value--empty';
        valueCell.textContent = this.dataset.emptyValueLabel || '—';
        values.append(valueCell);
      }

      fragment.append(row);
    }

    this.refs.groups.replaceChildren(fragment);
  }

  #collectSpecs(items) {
    const specsMap = new Map();

    for (const item of items) {
      const itemSpecs = Array.isArray(item.specs) ? item.specs : [];

      for (const spec of itemSpecs) {
        const key = normalizeText(spec.featureKey) || normalizeText(spec.label).toLowerCase();
        if (!key) continue;

        if (!specsMap.has(key)) {
          specsMap.set(key, {
            key,
            label: spec.label || key,
            groupKey: spec.groupKey || 'primary',
            groupLabel: spec.groupLabel || '',
            sortOrder: Number(spec.sortOrder) || 0,
            values: new Map(),
          });
        }

        specsMap.get(key).values.set(item.productId, spec.value || '');
      }
    }

    return Array.from(specsMap.values()).sort((left, right) => {
      const leftGroup = GROUP_ORDER[left.groupKey] ?? 10;
      const rightGroup = GROUP_ORDER[right.groupKey] ?? 10;
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.label.localeCompare(right.label);
    });
  }
}

if (!customElements.get('product-compare-toggle')) {
  customElements.define('product-compare-toggle', ProductCompareToggle);
}

if (!customElements.get('product-comparison-page')) {
  customElements.define('product-comparison-page', ProductComparisonPage);
}
