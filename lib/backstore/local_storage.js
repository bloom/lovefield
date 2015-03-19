/**
 * @license
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
goog.provide('lf.backstore.LocalStorage');

goog.require('goog.Promise');
goog.require('goog.object');
goog.require('goog.structs.Map');
goog.require('lf.BackStore');
goog.require('lf.Exception');
goog.require('lf.backstore.LocalStorageTable');
goog.require('lf.backstore.LocalStorageTx');



/**
 * A backing store implementation using LocalStorage. It can hold at most 10MB
 * of data, depending on browser. This backing store is experimental.
 *
 * Format of LocalStorage:
 *
 * namespace.version# Version of this database
 * namespace.tableName Serialized object of the table
 *
 * @implements {lf.BackStore}
 * @constructor
 *
 * @param {!lf.schema.Database} schema The schema of the database.
 */
lf.backstore.LocalStorage = function(schema) {
  /** @private {!lf.schema.Database} */
  this.schema_ = schema;

  /** @private {!goog.structs.Map<string, !lf.backstore.LocalStorageTable>} */
  this.tables_ = new goog.structs.Map();
};


/** Synchronous version of init(). */
lf.backstore.LocalStorage.prototype.initSync = function() {
  if (!window.localStorage) {
    throw new lf.Exception(lf.Exception.Type.NOT_SUPPORTED,
        'LocalStorage not supported by platform.');
  }

  var versionKey = this.schema_.name() + '.version#';
  var version = window.localStorage.getItem(versionKey);
  if (goog.isDefAndNotNull(version)) {
    if (version != this.schema_.version().toString()) {
      // TODO(arthurhsu): implement upgrade logic
      throw new lf.Exception(lf.Exception.Type.NOT_SUPPORTED,
          'LocalStorage upgrade logic not implemented.');
    }
    this.loadTables_();
  } else {
    this.loadTables_();
    window.localStorage.setItem(versionKey, this.schema_.version().toString());
    this.commit();
  }
};


/** @override */
lf.backstore.LocalStorage.prototype.init = function(opt_onUpgrade) {
  return new goog.Promise(goog.bind(function(resolve, reject) {
    this.initSync();
    resolve();
  }, this));
};


/** @private */
lf.backstore.LocalStorage.prototype.loadTables_ = function() {
  var prefix = this.schema_.name() + '.';
  this.schema_.tables().forEach(function(table) {
    var tableName = table.getName();
    this.tables_.set(
        tableName,
        new lf.backstore.LocalStorageTable(prefix + tableName));
    if (table.persistentIndex()) {
      var indices = table.getIndices();
      indices.forEach(function(index) {
        var indexName = index.getNormalizedName();
        this.tables_.set(
            indexName,
            new lf.backstore.LocalStorageTable(prefix + indexName));
      }, this);
    }
  }, this);
};


/**
 * @param {string} tableName The name of the table to get. Throws an exception
 *     if such a table does not exist.
 * @return {!lf.Stream}
 * @throws {lf.Exception}
 */
lf.backstore.LocalStorage.prototype.getTableInternal = function(tableName) {
  if (!this.tables_.containsKey(tableName)) {
    throw new lf.Exception(
        lf.Exception.Type.DATA,
        'Table ' + tableName + ' does not exist.');
  }

  return this.tables_.get(tableName);
};


/** @override */
lf.backstore.LocalStorage.prototype.createTx = function(mode, journal) {
  return new lf.backstore.LocalStorageTx(this, mode, journal);
};


/** @override */
lf.backstore.LocalStorage.prototype.close = function() {
};


/**
 * Flushes changes to local storage.
 */
lf.backstore.LocalStorage.prototype.commit = function() {
  this.tables_.getValues().forEach(function(table) {
    table.commit();
  });
};