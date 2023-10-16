const queryStatus_active = 1 << 1;
const queryStatus_cancelled = 1 << 2;
const queryStatus_error = 1 << 3;
const queryStatus_executed = 1 << 4;

const rawMode_values = 1;
const rawMode_objects = 2;

const _resolve = Symbol("resolve");
const _reject = Symbol("reject");
const _handle = Symbol("handle");
const _run = Symbol("run");
const _queryStatus = Symbol("status");
const _handler = Symbol("handler");
const PublicPromise = Promise;

const { createQuery, PostgresSQLConnection, init } = $lazy("bun:sql");

class Query extends PublicPromise {
  [_resolve];
  [_reject];
  [_handle];
  [_handler];
  [_queryStatus] = 0;

  constructor(handle, handler) {
    var resolve_, reject_;
    super((resolve, reject) => {
      resolve_ = resolve;
      reject_ = reject;
    });
    this[_resolve] = resolve_;
    this[_reject] = reject_;
    this[_handle] = handle;
    this[_handler] = handler;
    this[_queryStatus] = handle ? 0 : queryStatus_cancelled;
  }

  async [_run]() {
    const { [_handle]: handle, [_handler]: handler, [_queryStatus]: status } = this;

    if (status & (queryStatus_executed | queryStatus_cancelled)) {
      return;
    }

    this[_queryStatus] |= queryStatus_executed;
    await 1;
    return handler(this, handle);
  }

  get active() {
    return (this[_queryStatus] & queryStatus_active) !== 0;
  }

  set active(value) {
    const status = this[_queryStatus];
    if (status & (queryStatus_cancelled | queryStatus_error)) {
      return;
    }

    if (value) {
      this[_queryStatus] |= queryStatus_active;
    } else {
      this[_queryStatus] &= ~queryStatus_active;
    }
  }

  get cancelled() {
    return (this[_queryStatus] & queryStatus_cancelled) !== 0;
  }

  resolve(x) {
    this[_queryStatus] &= ~queryStatus_active;
    return this[_resolve](x);
  }

  reject(x) {
    this[_queryStatus] &= ~queryStatus_active;
    this[_queryStatus] |= queryStatus_error;
    return this[_reject](x);
  }

  cancel() {
    var status = this[_queryStatus];
    if (status & queryStatus_cancelled) {
      return this;
    }
    this[_queryStatus] |= queryStatus_cancelled;

    if (status & queryStatus_executed) {
      this[_handle].cancel();
    }

    return this;
  }

  execute() {
    this[_run]();
    return this;
  }

  raw() {
    this[_handle].raw = rawMode_objects;
    return this;
  }

  values() {
    this[_handle].raw = rawMode_values;
    return this;
  }

  then() {
    this[_run]();
    return super.$then.$apply(this, arguments);
  }

  catch() {
    this[_run]();
    return super.$catch.$apply(this, arguments);
  }

  finally() {
    this[_run]();
    return super.$finally.$apply(this, arguments);
  }
}
Object.defineProperty(Query, Symbol.species, { value: PublicPromise });
Object.defineProperty(Query, Symbol.toStringTag, { value: "Query" });
init(
  (query, result) => query.resolve(result),
  (query, reject) => query.reject(reject),
);

function createConnection({ hostname, port, username, password, tls, query, database }, onConnected, onClose) {
  return new PostgresSQLConnection(
    hostname,
    Number(port),
    username || "",
    password || "",
    database || "",
    tls || null,
    query || "",
    onConnected,
    onClose,
  );
}

function normalizeStrings(strings) {
  if ($isJSArray(strings)) {
    return strings.join("?");
  }

  return strings + "";
}

function loadOptions(o) {
  var hostname, port, username, password, database, tls, url, query, adapter;
  const env = Bun.env;

  if (typeof o === "undefined" || (typeof o === "string" && o.length === 0)) {
    const urlString = env.POSTGRES_URL || env.DATABASE_URL || env.PGURL || env.PG_URL;
    if (urlString) {
      url = new URL(urlString);
      o = {};
    }
  } else if (o && typeof o === "object") {
    if (o instanceof URL) {
      url = o;
    } else if (o?.url) {
      const _url = o.url;
      if (typeof _url === "string") {
        url = new URL(_url);
      } else if (_url && typeof _url === "object" && _url instanceof URL) {
        url = _url;
      }
    }
  } else if (typeof o === "string") {
    url = new URL(o);
  }

  if (url) {
    ({ hostname, port, username, password, protocol: adapter } = o = url);
    if (adapter[adapter.length - 1] === ":") {
      adapter = adapter.slice(0, -1);
    }
    const queryObject = url.searchParams.toJSON();
    query = "";
    for (const key in queryObject) {
      query += `${encodeURIComponent(key)}=${encodeURIComponent(queryObject[key])} `;
    }
    query = query.trim();
  }

  if (!o) {
    o = {};
  }

  hostname ||= o.hostname || o.host || env.PGHOST || "localhost";
  port ||= Number(o.port || env.PGPORT || 5432);
  username ||= o.username || o.user || env.PGUSERNAME || env.PGUSER || env.USER || env.USERNAME || "postgres";
  database ||= o.database || o.db || (url?.pathname ?? "").slice(1) || env.PGDATABASE || username;
  password ||= o.password || o.pass || env.PGPASSWORD || "";
  tls ||= o.tls || o.ssl;
  adapter ||= o.adapter || "postgres";

  port = Number(port);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  if (adapter && !(adapter === "postgres" || adapter === "postgresql")) {
    throw new Error(`Unsupported adapter: ${adapter}. Only \"postgres\" is supported for now`);
  }

  return { hostname, port, username, password, database, tls, query };
}

function SQL(o) {
  var connection,
    connected = false,
    connecting = false,
    closed = false,
    onConnect: any[] = [],
    connectionInfo = loadOptions(o);

  function connectedHandler(query, handle, err) {
    if (err) {
      return query.reject(err);
    }

    if (!connected) {
      return query.reject(new Error("Not connected"));
    }

    if (query.cancelled) {
      return query.reject(new Error("Query cancelled"));
    }

    handle.run(connection, query);
  }

  function pendingConnectionHandler(query, handle) {
    onConnect.push(err => connectedHandler(query, handle, err));
    if (!connecting) {
      connecting = true;
      connection = createConnection(connectionInfo, onConnected, onClose);
    }
  }

  function closedConnectionHandler(query, handle) {
    query.reject(new Error("Connection closed"));
  }

  function onConnected(err) {
    connected = !err;
    for (const handler of onConnect) {
      handler(err);
    }
    onConnect = [];
  }

  function onClose(err) {
    closed = true;
    onConnected(err);
  }

  function connectedSQL(strings, values) {
    return new Query(createQuery(normalizeStrings(strings), values), connectedHandler);
  }

  function closedSQL(strings, values) {
    return new Query(undefined, closedConnectionHandler);
  }

  function pendingSQL(strings, values) {
    return new Query(createQuery(normalizeStrings(strings), values), pendingConnectionHandler);
  }

  function sql(strings, ...values) {
    if (closed) {
      return closedSQL(strings, values);
    }

    if (connected) {
      return connectedSQL(strings, values);
    }

    return pendingSQL(strings, values);
  }

  sql.connect = () => {
    if (closed) {
      return Promise.reject(new Error("Connection closed"));
    }

    if (connected) {
      return Promise.resolve(sql);
    }

    var { resolve, reject, promise } = Promise.withResolvers();
    onConnect.push(err => (err ? reject(err) : resolve(sql)));
    if (!connecting) {
      connecting = true;
      connection = createConnection(connectionInfo, onConnected, onClose);
    }

    return promise;
  };

  sql.close = () => {
    if (closed) {
      return Promise.resolve();
    }

    var { resolve, promise } = Promise.withResolvers();
    onConnect.push(resolve);
    connection.close();
    return promise;
  };

  sql.flush = () => {
    if (closed || !connected) {
      return;
    }

    connection.flush();
  };
  return sql;
}

var lazyDefaultSQL;
var defaultSQLObject = function sql(strings, ...values) {
  if (!lazyDefaultSQL) {
    lazyDefaultSQL = SQL(undefined);
    Object.assign(defaultSQLObject, lazyDefaultSQL);
    exportsObject.default = exportsObject.sql = lazyDefaultSQL;
  }
  return lazyDefaultSQL(strings, ...values);
};

var exportsObject = {
  sql: defaultSQLObject,
  default: defaultSQLObject,
  SQL,
  Query,
};

export default exportsObject;
