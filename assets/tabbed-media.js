import { Component } from '@theme/component';

/**
 * @typedef {Object} TabbedMediaRefs
 * @property {HTMLElement[]} tabs
 * @property {HTMLElement[]} panels
 */

/** @extends {Component<TabbedMediaRefs>} */
class TabbedMediaComponent extends Component {
  requiredRefs = ['tabs', 'panels'];

  connectedCallback() {
    super.connectedCallback();

    const activeIndex = this.refs.tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    this.activate(activeIndex >= 0 ? activeIndex : 0, false);

    this.addEventListener('click', this.#handleClick);
    this.addEventListener('keydown', this.#handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener('click', this.#handleClick);
    this.removeEventListener('keydown', this.#handleKeydown);
  }

  /**
   * @param {number} index
   * @param {boolean} [moveFocus]
   */
  activate(index, moveFocus = true) {
    const { tabs, panels } = this.refs;
    if (!tabs?.length || !panels?.length || index < 0 || index >= tabs.length) return;

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
    const currentIndex = tabs.indexOf(target);
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
}

if (!customElements.get('tabbed-media-component')) {
  customElements.define('tabbed-media-component', TabbedMediaComponent);
}
