import "@testing-library/jest-dom";
import "fake-indexeddb/auto";

// jsdom logs "Not implemented" for window.scrollTo; LocalApp scrolls new screens to the top.
if (typeof window !== "undefined") window.scrollTo = () => {};
