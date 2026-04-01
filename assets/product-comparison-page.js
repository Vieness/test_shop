import { Component } from '@theme/component';
import {
  ProductComparisonStorage,
  PRODUCT_COMPARISON_MAX_ITEMS,
  PRODUCT_COMPARISON_STORAGE_EVENT,
} from '@theme/product-comparison-storage';

const GROUP_ORDER = {
  primary: 0,
  secondary: 1,
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

class ProductComparisonPage extends Component {
  requiredRefs = ['count', 'emptyState', 'content', 'cards', 'groups'];
  #abortController = new AbortController();
  #specDefinitions = {
    primaryHeading: 'Primary specifications',
    secondaryHeading: 'Secondary specifications',
    definitions: {},
  };

  connectedCallback() {
    super.connectedCallback();

    const source = this.querySelector('[data-compare-spec-definitions]');
    if (source instanceof HTMLScriptElement) {
      try {
        this.#specDefinitions = JSON.parse(source.textContent || '') || this.#specDefinitions;
      } catch (_error) {
        /* noop */
      }
    }

    const { signal } = this.#abortController;
    window.addEventListener(PRODUCT_COMPARISON_STORAGE_EVENT, this.renderComparison, { signal });
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
    const items = ProductComparisonStorage.getItems().slice(0, PRODUCT_COMPARISON_MAX_ITEMS);
    const empty = items.length === 0;

    this.refs.count.textContent = `${this.dataset.countLabel || 'Selected products'}: ${items.length}/${PRODUCT_COMPARISON_MAX_ITEMS}`;
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

    this.#renderProducts(items);
  };

  async #renderProducts(items) {
    const renderedProducts = (await Promise.all(items.map((item) => this.#fetchRenderedProduct(item)))).filter(Boolean);
    this.#renderCards(renderedProducts, items.length);
    this.#renderSpecs(renderedProducts, items.length);
  }

  #renderCards(renderedProducts, itemsLength) {
    const fragment = document.createDocumentFragment();

    for (const renderedProduct of renderedProducts) {
      const card = renderedProduct.card;
      if (!(card instanceof HTMLElement)) continue;

      const removeButton = card.querySelector('[data-remove-product]');
      if (removeButton instanceof HTMLButtonElement) {
        removeButton.setAttribute('aria-label', this.dataset.removeLabel || 'Remove product');
        removeButton.setAttribute('title', this.dataset.removeLabel || 'Remove product');
        removeButton.addEventListener('click', () => ProductComparisonStorage.removeItem(renderedProduct.data.productId));
      }

      fragment.append(card);
    }

    for (let index = itemsLength; index < PRODUCT_COMPARISON_MAX_ITEMS; index += 1) {
      const slot = document.createElement('div');
      slot.className = 'product-comparison__slot';
      slot.textContent = this.dataset.emptySlotLabel || 'Select one more product';
      fragment.append(slot);
    }

    this.refs.cards.replaceChildren(fragment);
  }

  #renderSpecs(renderedProducts, itemsLength) {
    const template = this.querySelector('[data-compare-row-template]');
    if (!(template instanceof HTMLTemplateElement)) return;

    const specs = this.#collectSpecs(renderedProducts);
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

      for (const renderedProduct of renderedProducts) {
        const valueCell = document.createElement('div');
        valueCell.className = 'product-comparison__spec-value';
        const value = spec.values.get(renderedProduct.data.productId);
        if (!normalizeText(value)) {
          valueCell.classList.add('product-comparison__spec-value--empty');
          valueCell.textContent = this.dataset.emptyValueLabel || '—';
        } else {
          valueCell.textContent = value;
        }
        values.append(valueCell);
      }

      for (let index = itemsLength; index < PRODUCT_COMPARISON_MAX_ITEMS; index += 1) {
        const valueCell = document.createElement('div');
        valueCell.className = 'product-comparison__spec-value product-comparison__spec-value--empty';
        valueCell.textContent = this.dataset.emptyValueLabel || '—';
        values.append(valueCell);
      }

      fragment.append(row);
    }

    this.refs.groups.replaceChildren(fragment);
  }

  async #fetchRenderedProduct(item) {
    const url = new URL(item.path || `/products/${item.handle}`, window.location.origin);
    url.searchParams.set('section_id', 'section-rendering-product-compare');

    try {
      const response = await fetch(url.toString());
      const html = await response.text();
      const documentFragment = new DOMParser().parseFromString(html, 'text/html');
      const container = documentFragment.querySelector('[data-product-comparison-render]');
      const card = container?.querySelector('[data-product-comparison-card]');
      const specsSource = container?.querySelector('[data-product-comparison-specs]');

      if (!(card instanceof HTMLElement) || !(specsSource instanceof HTMLScriptElement)) {
        return null;
      }

      return {
        card,
        data: JSON.parse(specsSource.textContent || '{}'),
      };
    } catch (_error) {
      return null;
    }
  }

  #collectSpecs(renderedProducts) {
    const specsMap = new Map();

    for (const renderedProduct of renderedProducts) {
      const itemSpecs = Array.isArray(renderedProduct.data.specs) ? renderedProduct.data.specs : [];

      for (const spec of itemSpecs) {
        const key = normalizeText(spec.featureKey) || normalizeText(spec.label).toLowerCase();
        if (!key) continue;
        const definition = this.#specDefinitions.definitions?.[key] || {};

        if (!specsMap.has(key)) {
          specsMap.set(key, {
            key,
            label: definition.label || spec.label || key,
            groupKey: definition.groupKey || spec.groupKey || 'primary',
            groupLabel:
              (definition.groupKey || spec.groupKey || 'primary') === 'secondary'
                ? this.#specDefinitions.secondaryHeading || spec.groupLabel || ''
                : this.#specDefinitions.primaryHeading || spec.groupLabel || '',
            sortOrder: Number(definition.sortOrder ?? spec.sortOrder) || 0,
            values: new Map(),
          });
        }

        specsMap.get(key).values.set(renderedProduct.data.productId, spec.value || '');
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

if (!customElements.get('product-comparison-page')) {
  customElements.define('product-comparison-page', ProductComparisonPage);
}
