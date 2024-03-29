/**
 * @fileoverview Singleton for all of the library's communcation
 * with the Earth Engine API.
 */

goog.provide('ee.data');
goog.provide('ee.data.AbstractTaskConfig');
goog.provide('ee.data.AlgorithmArgument');
goog.provide('ee.data.AlgorithmSignature');
goog.provide('ee.data.AlgorithmsRegistry');
goog.provide('ee.data.AssetDescription');
goog.provide('ee.data.BandDescription');
goog.provide('ee.data.DownloadId');
goog.provide('ee.data.FeatureCollectionDescription');
goog.provide('ee.data.GMEProject');
goog.provide('ee.data.GeoJSONFeature');
goog.provide('ee.data.GeoJSONGeometry');
goog.provide('ee.data.ImageCollectionDescription');
goog.provide('ee.data.ImageDescription');
goog.provide('ee.data.ImageList');
goog.provide('ee.data.ImageTaskConfig');
goog.provide('ee.data.MapId');
goog.provide('ee.data.PixelTypeDescription');
goog.provide('ee.data.ProcessingResponse');
goog.provide('ee.data.RawMapId');
goog.provide('ee.data.TableTaskConfig');
goog.provide('ee.data.TaskListResponse');
goog.provide('ee.data.TaskStatus');
goog.provide('ee.data.TaskUpdateActions');
goog.provide('ee.data.ThumbnailId');
goog.provide('ee.data.VideoTaskConfig');

goog.require('goog.Uri');
goog.require('goog.array');
goog.require('goog.json');
goog.require('goog.net.XhrIo');
goog.require('goog.net.XmlHttp');
goog.require('goog.net.jsloader');
goog.require('goog.object');
goog.require('goog.string');

goog.forwardDeclare('ee.Image');


/**
 * @type {string?} The base URL for all API calls.
 * @private
 */
ee.data.apiBaseUrl_ = null;


/**
 * @type {string?} The base URL for map tiles.
 * @private
 */
ee.data.tileBaseUrl_ = null;


/**
 * @type {string?} A string to pass in the "xsrfToken" parameter of XHRs.
 * @private
 */
ee.data.xsrfToken_ = null;


/**
 * @private {string?} An OAuth2 token to use for authenticating EE API calls.
 */
ee.data.authToken_ = null;


/**
 * @private {string?} The client ID used to retrieve OAuth2 tokens.
 */
ee.data.authClientId_ = null;


/**
 * @private {!Array<string>} The scopes to request when retrieving OAuth tokens.
 */
ee.data.authScopes_ = [];


/**
 * @private @const {string} The OAuth scope for the EE API.
 */
ee.data.AUTH_SCOPE_ = 'https://www.googleapis.com/auth/earthengine.readonly';


/**
 * @private @const {string} The URL of the Google APIs Client Library.
 */
ee.data.AUTH_LIBRARY_URL_ = 'https://apis.google.com/js/client.js';


/**
 * @type {boolean} Whether the library has been initialized.
 * @private
 */
ee.data.initialized_ = false;


/**
 * @type {number} The number of milliseconds to wait for each request before
 *     considering it timed out. 0 means no limit. Note that this is not
 *     supported by browsers for synchronous requests.
 * @private
 */
ee.data.deadlineMs_ = 0;


/**
 * @type {string} The default base URL for API calls.
 * @private
 * @const
 */
ee.data.DEFAULT_API_BASE_URL_ = '/api';


/**
 * @type {string} The default base URL for media/tile calls.
 * @private
 * @const
 */
ee.data.DEFAULT_TILE_BASE_URL_ = 'https://earthengine.googleapis.com';


/**
 * Actions that can update existing tasks.
 * @enum {string}
 */
ee.data.TaskUpdateActions = {
  CANCEL: 'CANCEL',
  UPDATE: 'UPDATE'
};


/**
 * Initializes the data module, setting base URLs.
 *
 * @param {string?=} opt_apiBaseUrl The (proxied) EarthEngine REST API
 *     endpoint.
 * @param {string?=} opt_tileBaseUrl The (unproxied) EarthEngine REST tile
 *     endpoint.
 * @param {string?=} opt_xsrfToken A string to pass in the "xsrfToken"
 *     parameter of XHRs.
 */
ee.data.initialize = function(opt_apiBaseUrl, opt_tileBaseUrl, opt_xsrfToken) {
  // If already initialized, only replace the explicitly specified parts.

  if (goog.isDefAndNotNull(opt_apiBaseUrl)) {
    ee.data.apiBaseUrl_ = opt_apiBaseUrl;
  } else if (!ee.data.initialized_) {
    ee.data.apiBaseUrl_ = ee.data.DEFAULT_API_BASE_URL_;
  }
  if (goog.isDefAndNotNull(opt_tileBaseUrl)) {
    ee.data.tileBaseUrl_ = opt_tileBaseUrl;
  } else if (!ee.data.initialized_) {
    ee.data.tileBaseUrl_ = ee.data.DEFAULT_TILE_BASE_URL_;
  }
  if (goog.isDef(opt_xsrfToken)) {  // Passing an explicit null clears it.
    ee.data.xsrfToken_ = opt_xsrfToken;
  }
  ee.data.initialized_ = true;
};


/**
 * Resets the data module, clearing custom base URLs.
 */
ee.data.reset = function() {
  ee.data.apiBaseUrl_ = null;
  ee.data.tileBaseUrl_ = null;
  ee.data.xsrfToken_ = null;
  ee.data.authClientId_ = null;
  ee.data.authScopes_ = [];
  ee.data.authToken_ = null;
  ee.data.initialized_ = false;
};


/**
 * Configures client-side authentication of EE API calls through the
 * Google APIs Client Library for JavaScript. The library will be loaded
 * automatically if it is not already loaded on the page. The user will be
 * asked to grant the application identified by clientId access to their EE
 * data if they have not done so previously.
 *
 * This should be called before the EE library is initialized.
 *
 * @param {?string} clientId The application's OAuth client ID, or null to
 *     disable authenticated calls. This can be obtained through the Google
 *     Developers Console. The project must have a JavaScript origin that
 *     corresponds to the domain where the script is running.
 * @param {function()} success The function to call if authentication succeeded.
 * @param {function(string)=} opt_error The function to call if authentication
 *     failed, passed the error message.
 * @param {!Array<string>=} opt_extraScopes Extra OAuth scopes to request.
 * @export
 *
 * TODO(user): Figure out if we need to deal with pop-up blockers.
 */
ee.data.authenticate = function(clientId, success, opt_error, opt_extraScopes) {
  // Remember the auth options.
  var scopes = [ee.data.AUTH_SCOPE_];
  if (opt_extraScopes) {
    goog.array.extend(scopes, opt_extraScopes);
    goog.array.removeDuplicates(scopes);
  }
  ee.data.authClientId_ = clientId;
  ee.data.authScopes_ = scopes;

  // Start the authentication flow as soon as we have the auth library.
  if (goog.isObject(goog.global['gapi']) &&
      goog.isObject(goog.global['gapi']['auth']) &&
      goog.isFunction(goog.global['gapi']['auth']['authorize'])) {
    ee.data.refreshAuthToken_(success, opt_error);
  } else {
    // The library is not loaded; load it now.
    var callbackName = goog.now().toString(36);
    while (callbackName in goog.global) callbackName += '_';
    goog.global[callbackName] = function() {
      delete goog.global[callbackName];
      ee.data.refreshAuthToken_(success, opt_error);
    };
    goog.net.jsloader.load(
        ee.data.AUTH_LIBRARY_URL_ + '?onload=' + callbackName);
  }
};


/**
 * Sets the timeout length for asynchronous API requests.
 *
 * @param {number} milliseconds The number of milliseconds to wait for a
 *     request before considering it timed out. 0 means no limit.
 * @export
 */
ee.data.setDeadline = function(milliseconds) {
  ee.data.deadlineMs_ = milliseconds;
};


/**
 * Returns the base URL used for API calls.
 *
 * @return {string?} The current API base URL.
 * @export
 */
ee.data.getApiBaseUrl = function() {
  return ee.data.apiBaseUrl_;
};


/**
 * Returns the base URL used for tiles.
 *
 * @return {string?} The current tile base URL.
 * @export
 */
ee.data.getTileBaseUrl = function() {
  return ee.data.tileBaseUrl_;
};


/**
 * Returns the current XSRF token.
 *
 * @return {string?} A string to pass in the "xsrfToken" parameter of XHRs.
 * @export
 */
ee.data.getXsrfToken = function() {
  return ee.data.xsrfToken_;
};


/**
 * Load info for an asset, given an asset id.
 *
 * @param {string} id The asset to be retrieved.
 * @param {function(Object, string=)=} opt_callback An optional callback.
 *     If not supplied, the call is made synchronously.
 * @return {?Object} The value call results, or null if a callback is specified.
 * @deprecated Use ee.data.getValue().
 * @export
 */
ee.data.getInfo = function(id, opt_callback) {
  if (goog.global.console && goog.global.console.error) {
    goog.global.console.error(
        'ee.data.getInfo is DEPRECATED. Use ee.data.getValue() instead.');
  }
  return ee.data.send_('/info',
                       new goog.Uri.QueryData().add('id', id),
                       opt_callback);
};


/**
 * Get a list of contents for a collection asset.
 * @param {Object} params An object containing request parameters with
 *     the following possible values:
 *       - id (string) The asset id of the collection to list.
 *       - starttime (number) Start time, in msec since the epoch.
 *       - endtime (number) End time, in msec since the epoch.
 *       - fields (comma-separated strings) Field names to return.
 * @param {function(ee.data.ImageList, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.ImageList} The list call results, or null if a callback
 *     is specified.
 * @export
 */
ee.data.getList = function(params, opt_callback) {
  var request = ee.data.makeRequest_(params);
  return /** @type {?ee.data.ImageList} */(
      ee.data.send_('/list', request, opt_callback));
};


/**
 * Get a Map ID for a given asset
 * @param {Object} params An object containing visualization
 *     options with the following possible values:
 *       - image (JSON string) The image to render.
 *       - version (number) Version number of image (or latest).
 *       - bands (comma-seprated strings) Comma-delimited list of
 *             band names to be mapped to RGB.
 *       - min (comma-separated numbers) Value (or one per band)
 *             to map onto 00.
 *       - max (comma-separated numbers) Value (or one per band)
 *             to map onto FF.
 *       - gain (comma-separated numbers) Gain (or one per band)
 *             to map onto 00-FF.
 *       - bias (comma-separated numbers) Offset (or one per band)
 *             to map onto 00-FF.
 *       - gamma (comma-separated numbers) Gamma correction
 *             factor (or one per band)
 *       - palette (comma-separated strings) List of CSS-style color
 *             strings (single-band previews only).
 *       - format (string) Either "jpg" or "png".
 * @param {function(ee.data.RawMapId, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.RawMapId} The mapId call results, or null if a callback
 *     is specified.
 * @export
 */
ee.data.getMapId = function(params, opt_callback) {
  params = goog.object.clone(params);
  return /** @type {?ee.data.RawMapId} */ (
      ee.data.send_('/mapid', ee.data.makeRequest_(params), opt_callback));
};


/**
 * Generate a URL for map tiles from a Map ID and coordinates.
 * @param {ee.data.RawMapId} mapid The mapid to generate tiles for.
 * @param {number} x The tile x coordinate.
 * @param {number} y The tile y coordinate.
 * @param {number} z The tile zoom level.
 * @return {string} The tile URL.
 * @export
 */
ee.data.getTileUrl = function(mapid, x, y, z) {
  var width = Math.pow(2, z);
  x = x % width;
  if (x < 0) {
    x += width;
  }
  return [ee.data.tileBaseUrl_, 'map', mapid['mapid'], z, x, y].join('/') +
      '?token=' + mapid['token'];
};


/**
 * Retrieve a processed value from the front end.
 * @param {Object} params The value to be evaluated, with the following
 *     possible values:
 *      - json (String) A JSON object to be evaluated.
 * @param {function(?, string=)=} opt_callback An optional callback.
 *     If not supplied, the call is made synchronously.
 * @return {?} The value call results, or null if a callback is specified.
 * @export
 */
ee.data.getValue = function(params, opt_callback) {
  params = goog.object.clone(params);
  return ee.data.send_('/value', ee.data.makeRequest_(params), opt_callback);
};


/**
 * Get a Thumbnail Id for a given asset.
 * @param {Object} params Parameters identical to those for the vizOptions for
 *     getMapId with the following additions:
 *       - size (a number or pair of numbers in format WIDTHxHEIGHT) Maximum
 *             dimensions of the thumbnail to render, in pixels. If only one
 *             number is passed, it is used as the maximum, and the other
 *             dimension is computed by proportional scaling.
 *       - region (E,S,W,N or GeoJSON) Geospatial region of the image
 *             to render. By default, the whole image.
 *       - format (string) Either 'png' (default) or 'jpg'.
 * @param {function(ee.data.ThumbnailId, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.ThumbnailId} The thumb ID and token, or null if a
 *     callback is specified.
 * @export
 */
ee.data.getThumbId = function(params, opt_callback) {
  params = goog.object.clone(params);
  if (goog.isArray(params['size'])) {
    params['size'] = params['size'].join('x');
  }
  var request = ee.data.makeRequest_(params).add('getid', '1');
  return /** @type {?ee.data.ThumbnailId} */(
      ee.data.send_('/thumb', request, opt_callback));
};


/**
 * Create a thumbnail URL from a thumbid and token.
 * @param {ee.data.ThumbnailId} id A thumbnail ID and token.
 * @return {string} The thumbnail URL.
 * @export
 */
ee.data.makeThumbUrl = function(id) {
  return ee.data.tileBaseUrl_ + '/api/thumb?thumbid=' + id['thumbid'] +
      '&token=' + id['token'];
};


/**
 * Get a Download ID.
 * @param {Object} params An object containing download options with the
 *     following possible values:
 *   - id: The ID of the image to download.
 *   - name: a base name to use when constructing filenames.
 *   - bands: a description of the bands to download. Must be an array of
 *         dictionaries, each with the following keys:
 *     + id: the name of the band, a string, required.
 *     + crs: an optional CRS string defining the band projection.
 *     + crs_transform: an optional array of 6 numbers specifying an affine
 *           transform from the specified CRS, in the order: xScale, yShearing,
 *           xShearing, yScale, xTranslation and yTranslation.
 *     + dimensions: an optional array of two integers defining the width and
 *           height to which the band is cropped.
 *     + scale: an optional number, specifying the scale in meters of the band;
 *              ignored if crs and crs_transform is specified.
 *   - crs: a default CRS string to use for any bands that do not explicitly
 *         specify one.
 *   - crs_transform: a default affine transform to use for any bands that do
 *         not specify one, of the same format as the crs_transform of bands.
 *   - dimensions: default image cropping dimensions to use for any bands that
 *         do not specify them.
 *   - scale: a default scale to use for any bands that do not specify one;
 *         ignored if crs and crs_transform is specified.
 *   - region: a polygon specifying a region to download; ignored if crs
 *         and crs_transform is specified.
 * @param {function(ee.data.DownloadId, string=)=} opt_callback An optional
 *     callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.DownloadId} A download id and token, or null if a callback
 *     is specified.
 * @export
 */
ee.data.getDownloadId = function(params, opt_callback) {
  // TODO(user): Redirect to getImageDownloadId.
  params = goog.object.clone(params);
  return /** @type {?ee.data.DownloadId} */ (ee.data.send_(
      '/download',
      ee.data.makeRequest_(params),
      opt_callback));
};


/**
 * Create a download URL from a docid and token.
 * @param {ee.data.DownloadId} id A download id and token.
 * @return {string} The download URL.
 * @export
 */
ee.data.makeDownloadUrl = function(id) {
  // TODO(user): Redirect to makeImageDownloadUrl.
  return ee.data.tileBaseUrl_ + '/api/download?docid=' + id['docid'] +
      '&token=' + id['token'];
};


/**
 * Get a download ID.
 * @param {Object} params An object containing table download options with the
 *     following possible values:
 *   - format: The download format, CSV or JSON.
 *   - selectors: Comma separated string of selectors that can be used to
 *          determine which attributes will be downloaded.
 *   - filename: The name of the file that will be downloaded.
 * @param {function(ee.data.DownloadId, string=)=} opt_callback An optional
 *     callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.DownloadId} A download id and token, or null if a
 *     callback is specified.
 * @export
 */
ee.data.getTableDownloadId = function(params, opt_callback) {
  params = goog.object.clone(params);
  return /** @type {?ee.data.DownloadId} */ (ee.data.send_(
      '/table',
      ee.data.makeRequest_(params),
      opt_callback));
};


/**
 * Create a table download URL from a docid and token.
 * @param {ee.data.DownloadId} id A table download id and token.
 * @return {string} The download URL.
 * @export
 */
ee.data.makeTableDownloadUrl = function(id) {
  return ee.data.tileBaseUrl_ + '/api/table?docid=' + id['docid'] +
      '&token=' + id['token'];
};


/**
 * Get the list of algorithms.
 *
 * @param {function(ee.data.AlgorithmsRegistry, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.AlgorithmsRegistry} The list of algorithm
 *     signatures, or null if a callback is specified.
 */
ee.data.getAlgorithms = function(opt_callback) {
  return /** @type {?ee.data.AlgorithmsRegistry} */ (
      ee.data.send_('/algorithms', null, opt_callback, 'GET'));
};


/**
 * Get the list of GME projects for the current user.
 *
 * @param {function(Array.<ee.data.GMEProject>, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?Array.<ee.data.GMEProject>} Null if a callback isn't specified,
 *     otherwise an array containing one object for each GME project.
 */
ee.data.getGMEProjects = function(opt_callback) {
  return /** @type {?Array.<ee.data.GMEProject>} */ (
      ee.data.send_('/gmeprojects', null, opt_callback, 'GET'));
};


/**
 * Save an asset.
 *
 * @param {string} value The JSON-serialized value of the asset.
 * @param {string=} opt_path An optional desired ID, including full path.
 * @param {boolean=} opt_force Force overwrite.
 * @param {function(Object, string=)=} opt_callback An optional callback.
 *     If not supplied, the call is made synchronously.
 * @return {?Object} A description of the saved asset, including a generated
 *     ID, or null if a callback is specified.
 */
ee.data.createAsset = function(value, opt_path, opt_force, opt_callback) {
  var args = {'value': value};
  if (opt_path !== undefined) {
    args['id'] = opt_path;
  }
  args['force'] = opt_force || false;
  return ee.data.send_('/create',
                       ee.data.makeRequest_(args),
                       opt_callback);
};
goog.exportSymbol('ee.data.createAsset', ee.data.createAsset);


/**
 * Create a folder.
 *
 * @param {string} path The path of the folder to create.
 * @param {boolean=} opt_force Force overwrite.
 * @param {function(Object, string=)=} opt_callback An optional callback.
 *     If not supplied, the call is made synchronously.
 * @return {?Object} A description of the newly created folder.
 */
ee.data.createFolder = function(path, opt_force, opt_callback) {
  var args = {
    'id': path,
    'force': opt_force || false
  };
  return ee.data.send_('/createfolder',
                       ee.data.makeRequest_(args),
                       opt_callback);
};
goog.exportSymbol('ee.data.createFolder', ee.data.createFolder);


/**
 * Retrieve a list of Asset snippets matching a query.
 * @param {string} query Search query for assets.
 * @param {function(?Array, string=)=} opt_callback An optional
 *     callback. If not supplied, the callback is made synchronously.
 * @return {Array.<ee.data.AssetDescription>} An array of data set indices.
 */
ee.data.search = function(query, opt_callback) {
  var params = {'q': query};
  return /** @type {Array.<ee.data.AssetDescription>} */ (
      ee.data.send_('/search', ee.data.makeRequest_(params), opt_callback));
};


/**
 * Generate an ID for a long-running task.
 *
 * @param {number=} opt_count Number of IDs to generate, one by default.
 * @param {function(Array.<string>, string=)=} opt_callback An optional
 *     callback. If not supplied, the call is made synchronously.
 * @return {?Array.<string>} An array containing generated ID strings, or null
 *     if a callback is specified.
 */
ee.data.newTaskId = function(opt_count, opt_callback) {
  var params = {};
  if (goog.isNumber(opt_count)) {
    params['count'] = opt_count;
  }
  return /** @type {?Array.<string>} */ (
      ee.data.send_('/newtaskid', ee.data.makeRequest_(params), opt_callback));
};
goog.exportSymbol('ee.data.newTaskId', ee.data.newTaskId);


/**
 * Retrieve status of one or more long-running tasks.
 *
 * @param {string|!Array.<string>} taskId ID of the task or an array of
 *     multiple task IDs.
 * @param {function(Array.<ee.data.TaskStatus>, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?Array.<ee.data.TaskStatus>} Null if a callback isn't specified,
 *     otherwise an array containing one object for each queried task, in the
 *     same order as the input array.
 */
ee.data.getTaskStatus = function(taskId, opt_callback) {
  if (goog.isString(taskId)) {
    taskId = [taskId];
  } else if (!goog.isArray(taskId)) {
    throw new Error('Invalid taskId: expected a string or ' +
        'an array of strings.');
  }
  var url = '/taskstatus?q=' + taskId.join();
  return /** @type {?Array.<ee.data.TaskStatus>} */ (
      ee.data.send_(url, null, opt_callback, 'GET'));
};
goog.exportSymbol('ee.data.getTaskStatus', ee.data.getTaskStatus);


/**
 * Retrieve a list of the users tasks.
 *
 * @param {function(ee.data.TaskListResponse, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is
 *     made synchronously.
 * @return {ee.data.TaskListResponse} An array of existing tasks,
 *     or null if a callback is specified.
 */
ee.data.getTaskList = function(opt_callback) {
  var url = '/tasklist';
  return /** @type {ee.data.TaskListResponse} */ (
      ee.data.send_(url, null, opt_callback, 'GET'));
};
goog.exportSymbol('ee.data.getTaskList', ee.data.getTaskList);


/**
 * Cancels the task provided.
 *
 * @param {string} taskId ID of the task.
 * @param {function(ee.data.ProcessingResponse, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?Array.<ee.data.TaskStatus>} An array of updated tasks, or null
 *     if a callback is specified.
 */
ee.data.cancelTask = function(taskId, opt_callback) {
  return ee.data.updateTask(
      taskId, ee.data.TaskUpdateActions.CANCEL, opt_callback);
};
goog.exportSymbol('ee.data.cancelTask', ee.data.cancelTask);


/**
 * Update one or more tasks' properties. For now, only the following properties
 * may be updated: State (to CANCELLED)
 * @param {string|!Array.<string>} taskId ID of the task or an array of
 *     multiple task IDs.
 * @param {ee.data.TaskUpdateActions} action Action performed on tasks.
 * @param {function(ee.data.ProcessingResponse, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?Array.<ee.data.TaskStatus>} An array of updated tasks, or null
 *     if a callback is specified.
 */
ee.data.updateTask = function(taskId, action, opt_callback) {
  //also cancel
  if (goog.isString(taskId)) {
    taskId = [taskId];
  } else if (!goog.isArray(taskId)) {
    throw new Error('Invalid taskId: expected a string or ' +
        'an array of strings.');
  }
  if (!goog.object.containsValue(ee.data.TaskUpdateActions, action)) {
    var errorMessage = 'Invalid action: ' + action;
    throw new Error(errorMessage);
  }

  var url = '/updatetask';
  var params = {
    'id': taskId,
    'action': action
  };

  return /** @type {?Array.<ee.data.TaskStatus>} */ (
      ee.data.send_(url, ee.data.makeRequest_(params), opt_callback, 'POST'));
};
goog.exportSymbol('ee.data.updateTask', ee.data.updateTask);


/**
 * Create processing task which computes a value.
 *
 * @param {string} taskId ID for the task (obtained using newTaskId).
 * @param {Object} params The value to be evaluated, with the following
 *     possible values:
 *        json (string) A JSON object to be evaluated.
 * @param {function(ee.data.ProcessingResponse, string=)=} opt_callback
 *     An optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.ProcessingResponse} May contain field 'note' with value
 *     'ALREADY_EXISTS' if an identical task with the same ID already exists.
 *     Null if a callback is specified.
 */
ee.data.prepareValue = function(taskId, params, opt_callback) {
  params = goog.object.clone(params);
  params['tid'] = taskId;
  return /** @type {?ee.data.ProcessingResponse} */ (
      ee.data.send_('/prepare', ee.data.makeRequest_(params), opt_callback));
};
goog.exportSymbol('ee.data.prepareValue', ee.data.prepareValue);


/**
 * Create processing task that exports or pre-renders an image.
 *
 * @param {string} taskId ID for the task (obtained using newTaskId).
 * @param {Object} params The object that describes the processing task;
 *    only fields that are common for all processing types are documented here.
 *      type (string) Either 'EXPORT_IMAGE' or 'EXPORT_FEATURES'.
 *      json (string) JSON description of the image.
 * @param {function(ee.data.ProcessingResponse, string=)=} opt_callback An
 *     optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.ProcessingResponse} May contain field 'note' with value
 *     'ALREADY_EXISTS' if an identical task with the same ID already exists.
 *     Null if a callback is specified.
 */
ee.data.startProcessing = function(taskId, params, opt_callback) {
  params = goog.object.clone(params);
  params['id'] = taskId;
  return /** @type {?ee.data.ProcessingResponse} */ (ee.data.send_(
      '/processingrequest', ee.data.makeRequest_(params), opt_callback));
};
goog.exportSymbol('ee.data.startProcessing', ee.data.startProcessing);


/**
 * Creates an asset import task.
 *
 * @param {string} taskId ID for the task (obtained using newTaskId).
 * @param {Object} request The object that describes the import task, which
 *     should have these fields:
 *      asset_id (string) The destination asset id (e.g. users/foo/bar).
 *      file_name (string) The source file's Google Cloud Storage object name.
 *        e.g. '/gs/ee.google.com.a.appspot.com/L2FwcGhvc3Rpbmdf'
 * @param {function(ee.data.ProcessingResponse, string=)=} opt_callback An
 *     optional callback. If not supplied, the call is made synchronously.
 * @return {?ee.data.ProcessingResponse} May contain field 'note' with value
 *     'ALREADY_EXISTS' if an identical task with the same ID already exists.
 *     Null if a callback is specified.
 */
ee.data.startImport = function(taskId, request, opt_callback) {
  var params = {
    'id': taskId,
    'request': goog.json.serialize(request)
  };
  return /** @type {?ee.data.ProcessingResponse} */ (ee.data.send_(
      '/import', ee.data.makeRequest_(params), opt_callback));
};
goog.exportSymbol('ee.data.startImport', ee.data.startImport);


/**
 * Send an API call.
 *
 * @param {string} path The API endpoint to call.
 * @param {?goog.Uri.QueryData} params The call parameters.
 * @param {function(?, string=)=} opt_callback An optional callback.
 *     If not specified, the call is made synchronously and the response
 *     is returned.
 * @param {string=} opt_method The HTTPRequest method (GET or POST), default
 *     is POST.
 *
 * @return {?Object} The data object returned by the API call, or null if a
 *     callback was specified.
 * @private
 */
ee.data.send_ = function(path, params, opt_callback, opt_method) {
  // Make sure we never perform API calls before initialization.
  ee.data.initialize();

  var method = opt_method || 'POST';
  // WARNING: The content-type header here must use this exact capitalization
  // to remain compatible with the Node.JS environment. See:
  // https://github.com/driverdan/node-XMLHttpRequest/issues/20
  var headers = {'Content-Type': 'application/x-www-form-urlencoded'};

  // Client-side authorization.
  if (goog.isDefAndNotNull(ee.data.authToken_)) {
    headers['Authorization'] = ee.data.authToken_;
  }

  // XSRF protection for a server-side API proxy.
  if (goog.isDefAndNotNull(ee.data.xsrfToken_)) {
    if (method == 'GET') {
      path += goog.string.contains(path, '?') ? '&' : '?';
      path += 'xsrfToken=' + ee.data.xsrfToken_;
    } else {
      if (!params) {
        params = new goog.Uri.QueryData();
      }
      params.add('xsrfToken', ee.data.xsrfToken_);
    }
  }

  // Handle processing and dispatching a callback response.
  var handleResponse = function(xhr, responseText, opt_callback) {
    var response, data, errorMessage;
    try {
      response = goog.json.unsafeParse(responseText);
      data = response['data'];
    } catch (e) {
      errorMessage = 'Invalid JSON: ' + responseText;
    }

    // Totally malformed, with either invalid JSON or JSON with
    // neither a data nor an error property.
    if (goog.isObject(response)) {
      if ('error' in response && 'message' in response['error']) {
        errorMessage = response['error']['message'];
      } else if (!('data' in response)) {
        errorMessage = 'Malformed response: ' + responseText;
      }
    } else if (xhr.status >= 300) {
      errorMessage = 'HTTP ' + xhr.status + ': ' +
                     (responseText || xhr.statusText);
    }

    if (opt_callback) {
      opt_callback(data, errorMessage);
      return null;
    } else {
      if (!errorMessage) {
        return data;
      }
      throw new Error(errorMessage);
    }
  };

  var url = ee.data.apiBaseUrl_ + path;
  var requestData = params ? params.toString() : '';
  if (opt_callback) {
    // Send an asynchronous request.
    goog.net.XhrIo.send(
        url,
        function(e) {
          var responseText = e.target.getResponseText();
          return handleResponse(e.target, responseText, opt_callback);
        },
        method,
        requestData,
        headers,
        ee.data.deadlineMs_);
    return null;
  } else {
    // Send a synchronous request.
    var xmlHttp = goog.net.XmlHttp();
    xmlHttp.open(method, url, false);
    goog.object.forEach(headers, function(value, key) {
      xmlHttp.setRequestHeader(key, value);
    });
    xmlHttp.send(requestData);
    return handleResponse(xmlHttp, xmlHttp.responseText, null);
  }
};


/**
 * Retrieves a new OAuth2 token for the currently configured ID and scopes.
 *
 * @param {function()=} opt_success The function to call if token refresh
 *     succeeds.
 * @param {function(string)=} opt_error The function to call if token refresh
 *     fails, passing the error message.
 * @private
 */
ee.data.refreshAuthToken_ = function(opt_success, opt_error) {
  // Set up auth options.
  var authArgs = {
    'client_id': ee.data.authClientId_,
    'immediate': true,
    'scope': ee.data.authScopes_.join(' ')
  };

  // A function to run when we get the authorization result.
  var done = function(result) {
    if (result['access_token']) {
      ee.data.authToken_ = result['token_type'] + ' ' + result['access_token'];
      // Set up a refresh timer. This is necessary because we cannot refresh
      // synchronously, but since we want to allow synchronous API requests,
      // something must ensure that the auth token is always valid.
      setTimeout(ee.data.refreshAuthToken_, result['expires_in'] * 1000 / 2);
      if (opt_success) opt_success();
    } else if (opt_error) {
      opt_error(result['error'] || 'Unknown error.');
    }
  };

  // Start the authorization flow, first trying immediate mode, which tries to
  // get the token behind the scenes, with no UI shown.
  var authorize = goog.global['gapi']['auth']['authorize'];
  authorize(authArgs, function(result) {
    if (result['error'] == 'immediate_failed') {
      // Could not auth invisibly. Auth using a dialog.
      authArgs['immediate'] = false;
      authorize(authArgs, done);
    } else {
      done(result);
    }
  });
};


/**
 * Convert an object into a goog.Uri.QueryData.
 *
 * @param {Object} params The params to convert.
 * @return {goog.Uri.QueryData} The converted parameters.
 * @private
 */
ee.data.makeRequest_ = function(params) {
  var request = new goog.Uri.QueryData();
  for (var item in params) {
    request.set(item, params[item]);
  }
  return request;
};


/**
 * Mock the networking calls used in send_.
 *
 * @param {Object=} opt_calls A dictionary containing the responses to return
 *     for each URL, keyed to URL.
 */
ee.data.setupMockSend = function(opt_calls) {
  var calls = opt_calls ? goog.object.clone(opt_calls) : {};
  // Mock XhrIo.send for async calls.
  goog.net.XhrIo.send = function(url, callback, method, data) {
    // An anonymous class to simulate an event.  Closure doesn't like this.
    /** @constructor */
    var fakeEvent = function() {};
    var e = new fakeEvent();
    e.target = {};
    e.target.getResponseText = function() {
      // If the mock is set up with a string for this URL, return that.
      // Otherwise, assume it's a function and call it.  If there's nothing
      // set for this url, return an error response.
      if (url in calls) {
        if (goog.isString(calls[url])) {
          return calls[url];
        } else {
          return calls[url](url, callback, method, data);
        }
      } else {
        return '{"error": {}}';
      }
    };
    // Call the callback in a timeout to simulate asynchronous behavior.
    setTimeout(goog.bind(/** @type {function()} */ (callback), e, e), 0);
    return new goog.net.XhrIo(); // Expected to be unused.
  };

  // Mock goog.net.XmlHttp for sync calls.
  /** @constructor */
  var fakeXmlHttp = function() {};
  var method = null;
  fakeXmlHttp.prototype.open = function(method, urlIn) {
    this.url = urlIn;
    this.method = method;
  };
  fakeXmlHttp.prototype.setRequestHeader = function() {};
  fakeXmlHttp.prototype.send = function(data) {
    if (this.url in calls) {
      if (goog.isString(calls[this.url])) {
        this.responseText = calls[this.url];
      } else {
        this.responseText = calls[this.url](this.url, this.method, data);
      }
    } else {
      // Return the input arguments.
      this.responseText = goog.json.serialize({
        'data': {
          'url': this.url,
          'method': this.method,
          'data': data
        }
      });
    }
  };
  goog.net.XmlHttp = function() {
    return /** @type {?} */ (new fakeXmlHttp());
  };
};


/**
 * The response from the /list servlet.
 * @typedef {Array.<{
 *   type: string,
 *   id: string,
 *   properties: (undefined|Object)
 * }>}
 */
ee.data.ImageList;


/**
 * An object describing a FeatureCollection, as returned by getValue.
 * Compatible with GeoJSON. The type field is always "FeatureCollection".
 * @typedef {{
 *   type: string,
 *   features: Array.<ee.data.GeoJSONFeature>
 * }}
 */
ee.data.FeatureCollectionDescription;


/**
 * An object that depicts a GME Project that the user may export to with
 * attribution ids for each project.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   attributions: Array.<Object>
 * }}
 */
ee.data.GMEProject;


/**
 * An object describing a Feature, as returned by getValue.
 * Compatible with GeoJSON. The type field is always "Feature".
 * @typedef {{
 *   type: string,
 *   id: (undefined|string),
 *   geometry: ?ee.data.GeoJSONGeometry,
 *   properties: (undefined|Object)
 * }}
 */
ee.data.GeoJSONFeature;


/**
 * An object describing a GeoJSON Geometry, as returned by getValue.
 * @typedef {{
 *   type: string,
 *   coordinates: Array.<number|Array.<number|Array.<number|Array.<number>>>>,
 *   crs: (undefined|{
 *     type: string,
 *     properties: {
 *       name: string
 *     }
 *   }),
 *   geodesic: boolean,
 *   geometries: (undefined|Array.<ee.data.GeoJSONGeometry>)
 * }}
 */
ee.data.GeoJSONGeometry;


/**
 * An object describing an ImageCollection, as returned by getValue.
 * The type field is always "ImageCollection".
 * @typedef {{
 *   type: string,
 *   id: (undefined|string),
 *   version: (undefined|number),
 *   bands: Array.<ee.data.BandDescription>,
 *   properties: (undefined|Object),
 *   features: Array.<ee.data.ImageDescription>
 * }}
 */
ee.data.ImageCollectionDescription;


/**
 * An object describing an Image, as returned by getValue.
 * The type field is always "Image".
 * @typedef {{
 *   type: string,
 *   id: (undefined|string),
 *   version: (undefined|number),
 *   bands: Array.<ee.data.BandDescription>,
 *   properties: (undefined|Object)
 * }}
 */
ee.data.ImageDescription;


/**
 * An object describing an Image band, as returned by getValue.
 * The dimensions field is [width, height].
 * @typedef {{
 *   id: string,
 *   data_type: ee.data.PixelTypeDescription,
 *   dimensions: (undefined|Array.<number>),
 *   crs: string,
 *   crs_transform: (undefined|Array.<number>),
 *   crs_transform_wkt: (undefined|string),
 *   properties: (undefined|Object)
 * }}
 */
ee.data.BandDescription;


/**
 * An object describing a PixelType, as returned by getValue.
 * The type field is always "PixelType". The precision field is
 * "int", "float" or "double".
 * @typedef {{
 *   type: string,
 *   precision: string,
 *   min: (undefined|number),
 *   max: (undefined|number),
 *   dimensions: (undefined|number)
 * }}
 */
ee.data.PixelTypeDescription;


/**
 * The registry of EE algorithms.
 *
 * @typedef {Object.<ee.data.AlgorithmSignature>}
 */
ee.data.AlgorithmsRegistry;


/**
 * The signature of an algorithm.
 *
 * @typedef {{
 *   args: Array.<ee.data.AlgorithmArgument>,
 *   returns: string,
 *   description: string,
 *   deprecated: (string|undefined)
 * }}
 */
ee.data.AlgorithmSignature;


/**
 * The signature of a single algorithm argument.
 * @typedef {{
 *   name: string,
 *   type: string,
 *   optional: boolean,
 *   default: *
 * }}
 */
ee.data.AlgorithmArgument;


/**
 * An identifier and security token for a thumbnail image.
 * @typedef {{
 *   thumbid: string,
 *   token: string
 * }}
 */
ee.data.ThumbnailId;


/**
 * An identifier and security token for an image or table to download.
 * @typedef {{
 *   docid: string,
 *   token: string
 * }}
 */
ee.data.DownloadId;


/**
 * An identifier and security token for a tiled map.
 * @typedef {{
 *     mapid: string,
 *     token: string
 * }}
 */
ee.data.RawMapId;


/**
 * A RawMapID together with the image from which it was generated.
 * @typedef {{
 *     mapid: string,
 *     token: string,
 *     image: ee.Image
 * }}
 */
ee.data.MapId;


/**
 * An object to specifying common user preferences for the creation of a new
 * task.
 *
 * @typedef {{
 *   id: (undefined|string),
 *   type: string,
 *   description: (undefined|string),
 *   sourceURL: (undefined|string),
 *   json: (undefined|string)
 * }}
 */
ee.data.AbstractTaskConfig;


/**
 * An object for specifying user preferences for the creation of a new
 * task. See com.google.earthengine.service.frontend.ProcessingInput.
 *
 * @typedef {{
 *   id: string,
 *   type: string,
 *   json: string,
 *   description: (undefined|string),
 *   sourceURL: (undefined|string),
 *   crs: (undefined|string),
 *   crs_transform: (undefined|string),
 *   dimensions: (undefined|string),
 *   scale: (undefined|number),
 *   region: (undefined|string),
 *   maxPixels: (undefined|number),
 *   gmeProjectId: (undefined|string),
 *   gmeAttributionName: (undefined|string),
 *   gmeMosaic: (undefined|string),
 *   gmeTerrain: (undefined|boolean),
 *   driveFolder: (undefined|string),
 *   driveFileNamePrefix: (undefined|string)
 * }}
 */
ee.data.ImageTaskConfig;


/**
 * An object for specifying configuration of a task to export feature
 * collections.
 *
 * @typedef {{
 *   id: string,
 *   type: string,
 *   json: string,
 *   description: (undefined|string),
 *   driveFolder: (undefined|string),
 *   driveFileNamePrefix: (undefined|string),
 *   fileFormat: (undefined|string),
 *   sourceUrl: (undefined|string),
 *   gmeProjectId: (undefined|string),
 *   gmeAttributionName: (undefined|string),
 *   gmeAssetName: (undefined|string)
 * }}
 */
ee.data.TableTaskConfig;


/**
 * An object for specifying configuration of a task to export image
 * collections as video.
 *
 * @typedef {{
 *   id: string,
 *   type: string,
 *   json: string,
 *   sourceUrl: (undefined|string),
 *   description: (undefined|string),
 *   driveFolder: (undefined|string),
 *   driveFileNamePrefix: (undefined|string),
 *   fps: (undefined|number),
 *   crs: (undefined|string),
 *   crs_transform: (undefined|string),
 *   dimensions: (undefined|Array),
 *   region: (undefined|string),
 *   scale: (undefined|number)
 * }}
 */
ee.data.VideoTaskConfig;


/**
 * A description of the status of a long-running tasks. See the Task
 * proto for a description of these fields.
 * @typedef {{
 *   id: (undefined|string),
 *   task_type: (undefined|string),
 *   creation_timestamp_ms: (undefined|number),
 *   update_timestamp_ms: (undefined|number),
 *   description: (undefined|string),
 *   priority: (undefined|number),
 *   progress: (undefined|number),
 *   source_url: (undefined|string),
 *   output_url: (undefined|Array.<string>),
 *   state: (undefined|string),
 *   internal_error_info: (undefined|string),
 *   error_message: (undefined|string)
 * }}
 */
ee.data.TaskStatus;


/**
 * A response for a call to start a batch process.
 * The "started" field is always "OK".
 * The note field is either "ALREADY_EXISTS" or missing.
 * @typedef {{
 *   started: string,
 *   note: (undefined|string)
 * }}
 */
ee.data.ProcessingResponse;


/**
 * A response for a call to get task status data.
 * @typedef {{
 *   tasks: Array.<ee.data.TaskStatus>
 * }}
 */
ee.data.TaskListResponse;


/**
 * A public asset description.
 * @typedef {{
 *   tags: (undefined|Array.<string>),
 *   thumb: (undefined|string),
 *   title: string,
 *   provider: string,
 *   type: string,
 *   period: number,
 *   period_mapping: (undefined|Array.<number>),
 *   description: string,
 *   id: string
 * }}
 */
ee.data.AssetDescription;
