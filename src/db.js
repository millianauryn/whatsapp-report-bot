import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { config } from './config.js'

const file = process.env.BOT_DATA_FILE || config.data_file
const data = { collections: {} }

export function load() {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (raw && raw.collections) Object.assign(data.collections, raw.collections)
  } catch {
    save()
  }
}

export function save() {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

function col(name) {
  if (!data.collections[name]) data.collections[name] = {}
  return data.collections[name]
}

export function get(name, key, fallback) {
  const c = col(name)
  return key in c ? c[key] : fallback
}

export function set(name, key, value) {
  col(name)[key] = value
  save()
}

export function del(name, key) {
  const c = col(name)
  if (key in c) {
    delete c[key]
    save()
  }
}

export function clear(name) {
  data.collections[name] = {}
  save()
}

/** Daftar semua kunci pada sebuah koleksi. */
export function keys(name) {
  return Object.keys(col(name))
}