import { Component } from '@theme/component';

/**
 * @typedef {Object} TabbedMediaRefs
 * @property {HTMLElement[]} tabs
 * @property {HTMLElement[]} panels
 */

/** @extends {Component<TabbedMediaRefs>} */
class TabbedMediaComponent extends Component {
  requiredRefs = ['tabs', 'panels'];
  #drag = null;
  #boundBlockSelect = (event) => this.#handleBlockSelect(event);

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('click', this.#handleClick);
    this.addEventListener('keydown', this.#handleKeydown);

    const savedIndex = this.#savedActiveIndex;
    if (savedIndex !== null) {
      this.activate(savedIndex, false);
    }

    if (window.Shopify?.designMode) {
      this.addEventListener('pointerdown', this.#handlePointerDown);
      window.addEventListener('pointermove', this.#handlePointerMove);
      window.addEventListener('pointerup', this.#handlePointerUp);
      document.addEventListener('shopify:block:select', this.#boundBlockSelect);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener('click', this.#handleClick);
    this.removeEventListener('keydown', this.#handleKeydown);

    if (window.Shopify?.designMode) {
      this.removeEventListener('pointerdown', this.#handlePointerDown);
      window.removeEventListener('pointermove', this.#handlePointerMove);
      window.removeEventListener('pointerup', this.#handlePointerUp);
      document.removeEventListener('shopify:block:select', this.#boundBlockSelect);
    }
  }

  /**
   * @param {number} index
   * @param {boolean} [moveFocus]
   */
  activate(index, moveFocus = true) {
    const { tabs, panels } = this.refs;
    if (!tabs?.length || !panels?.length || index < 0 || index >= tabs.length) return;

    this.#saveActiveIndex(index);

    for (const [tabIndex, tab] of tabs.entries()) {
      const isActive = tabIndex === index;

      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');

      if (isActive && moveFocus) tab.focus();
    }

    for (const [panelIndex, panel] of panels.entries()) {
      const isActive = panelIndex === index;

      panel.toggleAttribute('hidden', !isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
    }
  }

  /** @param {MouseEvent} event */
  #handleClick = (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);

    const hotspotHandle = target?.closest('[data-hotspot-drag-handle]');
    const hotspot = hotspotHandle?.closest('[data-hotspot]');
    if (window.Shopify?.designMode && hotspotHandle) {
      event.stopPropagation();
    }

    if (hotspot?.dataset.suppressClick === 'true') {
      event.preventDefault();
      event.stopPropagation();
      delete hotspot.dataset.suppressClick;
      return;
    }

    const tab = target?.closest('[role="tab"]');
    if (!tab) return;

    const index = this.refs.tabs.indexOf(tab);
    if (index === -1) return;

    event.preventDefault();
    this.activate(index, false);
  };

  /** @param {KeyboardEvent} event */
  #handleKeydown = (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    if (target?.getAttribute('role') !== 'tab') return;

    const { tabs } = this.refs;
    const currentIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    if (currentIndex === -1) return;

    const keyToIndex = {
      ArrowRight: (currentIndex + 1) % tabs.length,
      ArrowLeft: (currentIndex - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };

    const nextIndex = keyToIndex[event.key];
    if (nextIndex === undefined) return;

    event.preventDefault();
    this.activate(nextIndex);
  };

  #handlePointerDown = (event) => {
    if (!(event.target instanceof HTMLElement)) return;

    const handle = event.target.closest('[data-hotspot-drag-handle]');
    const hotspot = handle?.closest('[data-hotspot]');
    const imageWrapper = hotspot?.closest('.tabbed-media__image-wrapper');

    if (!(handle instanceof HTMLElement) || !(hotspot instanceof HTMLElement) || !(imageWrapper instanceof HTMLElement)) return;

    event.stopPropagation();

    this.#drag = {
      hotspot,
      imageWrapper,
      pointerId: event.pointerId,
      moved: false,
    };

    hotspot.setAttribute('data-dragging', 'true');
    handle.setPointerCapture?.(event.pointerId);
  };

  #handlePointerMove = (event) => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    drag.moved = true;

    const rect = drag.imageWrapper.getBoundingClientRect();
    const x = this.#clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = this.#clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    drag.hotspot.style.setProperty('--hotspot-x', `${x}%`);
    drag.hotspot.style.setProperty('--hotspot-y', `${y}%`);

    drag.hotspot.querySelector('[data-hotspot-x]')?.replaceChildren(String(Math.round(x)));
    drag.hotspot.querySelector('[data-hotspot-y]')?.replaceChildren(String(Math.round(y)));
  };

  #handlePointerUp = (event) => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.moved) {
      drag.hotspot.open = false;
      drag.hotspot.dataset.suppressClick = 'true';
    }

    drag.hotspot.removeAttribute('data-dragging');
    this.#drag = null;
  };

  #clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  #handleBlockSelect(event) {
    if (!(event.target instanceof HTMLElement)) return;
    if (!this.contains(event.target)) return;

    const tab = event.target.closest('[role="tab"]');
    if (!(tab instanceof HTMLElement)) return;

    const index = this.refs.tabs.indexOf(tab);
    if (index === -1) return;

    this.activate(index, false);
  }

  get #storageKey() {
    const sectionId = this.dataset.sectionId;
    return sectionId ? `tabbed-media:${sectionId}:active-tab` : null;
  }

  get #savedActiveIndex() {
    if (!window.Shopify?.designMode) return null;
    const key = this.#storageKey;
    if (!key) return null;

    const value = window.sessionStorage.getItem(key);
    if (value === null) return null;

    const index = Number.parseInt(value, 10);
    return Number.isNaN(index) ? null : index;
  }

  #saveActiveIndex(index) {
    if (!window.Shopify?.designMode) return;
    const key = this.#storageKey;
    if (!key) return;

    window.sessionStorage.setItem(key, String(index));
  }
}

if (!customElements.get('tabbed-media-component')) {
  customElements.define('tabbed-media-component', TabbedMediaComponent);
}
