export function createWorld() {
  let nextEntityId = 1;
  const entities = new Set();
  const componentStores = new Map();

  function getStore(name) {
    let store = componentStores.get(name);
    if (!store) {
      store = new Map();
      componentStores.set(name, store);
    }
    return store;
  }

  function createEntity() {
    const id = nextEntityId++;
    entities.add(id);
    return id;
  }

  function destroyEntity(id) {
    entities.delete(id);
    for (const store of componentStores.values()) {
      store.delete(id);
    }
  }

  function addComponent(id, name, data) {
    getStore(name).set(id, data);
    return data;
  }

  function getComponent(id, name) {
    const store = componentStores.get(name);
    return store ? store.get(id) : undefined;
  }

  function hasComponent(id, name) {
    const store = componentStores.get(name);
    return store ? store.has(id) : false;
  }

  function removeComponent(id, name) {
    const store = componentStores.get(name);
    if (store) {
      store.delete(id);
    }
  }

  function query(...names) {
    const stores = names.map((name) => componentStores.get(name));
    if (stores.some((store) => !store)) {
      return [];
    }
    const sorted = stores.slice().sort((a, b) => a.size - b.size);
    const smallest = sorted[0];
    const rest = sorted.slice(1);
    const result = [];
    for (const id of smallest.keys()) {
      if (rest.every((store) => store.has(id))) {
        result.push(id);
      }
    }
    return result;
  }

  function queryInto(names, out) {
    out.length = 0;
    let smallest = null;
    for (let i = 0; i < names.length; i++) {
      const store = componentStores.get(names[i]);
      if (store === undefined) {
        return out;
      }
      if (smallest === null || store.size < smallest.size) {
        smallest = store;
      }
    }
    outer: for (const id of smallest.keys()) {
      for (let i = 0; i < names.length; i++) {
        if (!componentStores.get(names[i]).has(id)) {
          continue outer;
        }
      }
      out.push(id);
    }
    return out;
  }

  function queryFirst(...names) {
    const stores = names.map((name) => componentStores.get(name));
    if (stores.some((store) => !store)) {
      return undefined;
    }
    let smallest = stores[0];
    for (let i = 1; i < stores.length; i++) {
      if (stores[i].size < smallest.size) {
        smallest = stores[i];
      }
    }
    for (const id of smallest.keys()) {
      let match = true;
      for (let i = 0; i < stores.length; i++) {
        if (stores[i] !== smallest && !stores[i].has(id)) {
          match = false;
          break;
        }
      }
      if (match) {
        return id;
      }
    }
    return undefined;
  }

  function clear() {
    entities.clear();
    componentStores.clear();
  }

  return {
    createEntity,
    destroyEntity,
    addComponent,
    getComponent,
    hasComponent,
    removeComponent,
    query,
    queryInto,
    queryFirst,
    clear,
  };
}
