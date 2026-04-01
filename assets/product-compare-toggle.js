import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';
import {
  ProductComparisonStorage,
  PRODUCT_COMPARISON_MAX_ITEMS,
  PRODUCT_COMPARISON_STORAGE_EVENT,
} from '@theme/product-comparison-storage';

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
    window.addEventListener(PRODUCT_COMPARISON_STORAGE_EVENT, this.#syncState, { signal });
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

    this.#payload.path = `${window.location.pathname}${window.location.search}`;

    if (ProductComparisonStorage.contains(this.#payload.productId)) {
      ProductComparisonStorage.upsertItem(this.#payload);
    }
  };

  #handleClick = () => {
    if (!this.#payload) return;

    const payload = {
      productId: this.#payload.productId,
      handle: this.#payload.handle,
      path: `${window.location.pathname}${window.location.search}` || this.#payload.path,
      compareGroup: this.#payload.compareGroup,
    };

    const isActive = ProductComparisonStorage.contains(this.#payload.productId);
    if (isActive) {
      ProductComparisonStorage.removeItem(this.#payload.productId);
      this.refs.message.textContent = '';
      return;
    }

    const result = ProductComparisonStorage.addItem(payload);
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

    this.refs.count.textContent = `${countLabel}: ${items.length}/${PRODUCT_COMPARISON_MAX_ITEMS}`;

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

if (!customElements.get('product-compare-toggle')) {
  customElements.define('product-compare-toggle', ProductCompareToggle);
}
