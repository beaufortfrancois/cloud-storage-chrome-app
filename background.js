var STORAGE_BASE_URL = 'https://www.googleapis.com/storage/v1/';

var bucket = 'chromeos-wallpaper-public';
//var bucket = 'fbeaufort-test';

function getAuthToken(successCallback, errorCallback) {
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    if (chrome.runtime.lastError) {
      errorCallback();
    } else {
      successCallback(token);
    }
  });
}

function request(url, successCallback, errorCallback) {
  getAuthToken(function(token) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onloadend = function() {
      if (xhr.status === 200) {
        successCallback(xhr.response);
      } else {
        errorCallback();
      }
    }
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.responseType = 'json';
    xhr.send();
  }, errorCallback);
}

function getObjectMediaLink(bucket, object, successCallback, errorCallback) {
  var url = STORAGE_BASE_URL + 'b/' + bucket + '/o/' + encodeURIComponent(object) +
            '?fields=mediaLink';
  request(url, successCallback, errorCallback);
}

function getObjectsList(bucket, prefix, successCallback, errorCallback) {
  var url = STORAGE_BASE_URL + 'b/' + bucket + '/o' +
            '?delimiter=%2F' +
            '&fields=' + encodeURIComponent('items(name,size,updated,contentType),prefixes') +
            '&prefix=' + (prefix ? encodeURIComponent(prefix) : '');
  request(url, successCallback, errorCallback);
}

function onGetMetadataRequested(options, onSuccess, onError) {
  console.log('onGetMetadataRequested', options.entryPath);

  if (options.entryPath === '/') {
    onSuccess(rootEntry);
    return;
  }

  var prefix = options.entryPath.substr(1);
  getObjectsList(bucket, prefix, function(response) {
    if (response.items) {
      for (var item of response.items) {
        if (item.name === prefix) {
          var entryName = item.name;
          if (entryName.lastIndexOf('/') >= 0) {
            entryName = entryName.substring(entryName.lastIndexOf('/')+1);
          }
          var entry = {
            'isDirectory': false,
            'name': entryName,
            'size': parseInt(item.size, 10),
            'modificationTime': new Date(item.updated),
            'mimeType': item.contentType
          };
          console.log('onSuccess(entry)', entry);
          onSuccess(entry);
          return;
        }
      }
    } else if (response.prefixes) {
      var directory = {
        'isDirectory': true,
        'name': prefix,
        'size': 0,
        'modificationTime': new Date()
      };
      console.log('onSuccess(directory)', directory);
      onSuccess(directory);
    } else {
      onError('FAILED');
    }
  }, function() {
    onError('FAILED');
  });
}

function onReadDirectoryRequested(options, onSuccess, onError) {
  console.log('onReadDirectoryRequested', options.directoryPath);

  var prefix = '';
  if (options.directoryPath !== '/') {
    prefix = options.directoryPath.substr(1) + '/';
  }
  getObjectsList(bucket, prefix, function(response) {
    var entries = [];
    if (response.items) {
      for (var item of response.items) {
        entries.push({
          'isDirectory': false,
          'name': item.name.substr(prefix.length),
          'size': parseInt(item.size, 10),
          'modificationTime': new Date(item.updated),
          'mimeType': item.contentType
        });
      }
    }
    if (response.prefixes) {
      for (var item of response.prefixes) {
        entries.push({
          'isDirectory': true,
          'name': item.substr(prefix.length).slice(0, -1),
          'size': 0,
          'modificationTime': new Date()
        });
      }
    }
    console.log('onReadDirectoryRequested', entries);
    onSuccess(entries, false /* hasMore */);
  }, function() {
    onError('FAILED');
  });
}

// A map with currently opened files. As key it has requestId of
// openFileRequested and as a value the file path.
var openedFiles = {};

function onOpenFileRequested(options, onSuccess, onError) {
  console.log('onOpenFileRequested', options);
  if (options.mode != 'READ' || options.create) {
    onError('INVALID_OPERATION');
  } else {
    openedFiles[options.requestId] = options.filePath;
    onSuccess();
  }
}

function onReadFileRequested(options, onSuccess, onError) {
  console.log('onReadFileRequested', options);

  var filePath = openedFiles[options.openRequestId].substr(1);
  getObjectMediaLink(bucket, filePath, function(response) {
    getAuthToken(function(token) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', response.mediaLink);
      xhr.responseType = 'arraybuffer';
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Range', 'bytes=' + options.offset + '-' +
                                    (options.length + options.offset - 1));
      xhr.onloadend = function() {
        if (xhr.status === 206) {
          onSuccess(xhr.response, false /* last call */);
        } else {
          onError('NOT_FOUND');
        }
      };
      xhr.send();
    }, function() {
      onError('ACCESS_DENIED');
    });
  }, function() {
    onError('NOT_FOUND');
  });
}

function onCloseFileRequested(options, onSuccess, onError) {
  console.log('onCloseFileRequested', options);
  if (!openedFiles[options.openRequestId]) {
    onError('INVALID_OPERATION');
    return;
  }

  delete openedFiles[options.openRequestId];
  onSuccess();
}

function onUnmountRequested(options, onSuccess, onError) {
  onSuccess();
}
chrome.fileSystemProvider.onGetMetadataRequested.addListener(onGetMetadataRequested);
chrome.fileSystemProvider.onReadDirectoryRequested.addListener(onReadDirectoryRequested);
chrome.fileSystemProvider.onOpenFileRequested.addListener(onOpenFileRequested);
chrome.fileSystemProvider.onReadFileRequested.addListener(onReadFileRequested);
chrome.fileSystemProvider.onCloseFileRequested.addListener(onCloseFileRequested);
chrome.fileSystemProvider.onUnmountRequested.addListener(onUnmountRequested);

// Save root metadata.
var rootEntry = {
  isDirectory: true,
  name: '', // Must be empty string.
  size: 0,
  modificationTime: new Date()
};

// Mount the file system.
var options = { fileSystemId: bucket, displayName: 'gs://'+bucket };
chrome.fileSystemProvider.mount(options, function() {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
  }
});
