var bucketName = 'chromeos-wallpaper-public';
var bucketName = 'fbeaufort-test';

function onGetMetadataRequested(options, onSuccess, onError) {
  console.log('onGetMetadataRequested', options.entryPath);
  
  if (options.entryPath === '/') {
    onSuccess(rootEntry);
    return;
  }
  
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    var prefix = options.entryPath.substr(1);
    xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://www.googleapis.com/storage/v1/b/' + bucketName + 
                    '/o?prefix=' + encodeURI(prefix));
    xhr.onload = function(result) {

      for (var item of xhr.response.items) {
        if (item.name === options.entryPath) {
          var entry = {
            'isDirectory': false,
            'name': item.name.substr(prefix.length),
            'size': parseInt(item.size),
            'modificationTime': new Date(item.updated),
            'mimeType': item.contentType
          };
          onSuccess(entry);
          return;
        }
      }
      // We always return a directory...
      var directory = {
        'isDirectory': true,
        'name': prefix,
        'size': 0,
        'modificationTime': new Date()
      };
      console.log('onGetMetadataRequested directory', directory);
      onSuccess(directory);
    };
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.responseType = 'json';
    xhr.send();
  });
}

function onReadDirectoryRequested(options, onSuccess, onError) {
  console.log('onReadDirectoryRequested', options);
  
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    var prefix = options.directoryPath.substr(1);
    xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://www.googleapis.com/storage/v1/b/' + bucketName +
                    '/o?prefix=' + encodeURI(prefix));
    xhr.onload = function(result) {
      var entries = [];
      var directories = [];
      console.log(xhr.response);
      for (var item of xhr.response.items) {
        item.name = item.name.substr(prefix.length); // Remove prefix to ease things
        if (item.name.indexOf('/') >= 0) {
          var directoryName = item.name.substr(0, item.name.indexOf('/'));
          console.log(item.name);
          if (directories.indexOf(directoryName) === -1) {
            entries.push({
              'isDirectory': true,
              'name': directoryName,
              'size': 0,
              'modificationTime': new Date()
            });
            directories.push(directoryName);
          }
          continue;
        }
        entries.push({
          'isDirectory': false,
          'name': item.name,
          'size': parseInt(item.size),
          'modificationTime': new Date(item.updated),
          'mimeType': item.contentType
        });
      }
      console.log(entries);
      onSuccess(entries, false /* hasMore */);
    };
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.responseType = 'json';
    xhr.send();
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
    chrome.storage.local.get(null, function(metadata) {
      openedFiles[options.requestId] = options.filePath;
      onSuccess();
    });
  }
}

function onReadFileRequested(options, onSuccess, onError) {
  onError('SECRUITY');
  return;
  console.log('onReadFileRequested', options);
  chrome.storage.local.get(null, function(localMetadata) {
    var filePath = openedFiles[options.openRequestId];
    if (!filePath) {
      onError('SECURITY');
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', localMetadata[filePath].url);
    xhr.setRequestHeader('Range', 'bytes=' + options.offset + '-' + (options.length + options.offset - 1));
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
      if (xhr.readyState === 4 && xhr.status === 206) {
        onSuccess(xhr.response, false /* last call */);
        if (localMetadata[filePath].url !== xhr.responseURL) {
          var metadata = {};
          metadata[filePath] = localMetadata[filePath];
          metadata[filePath].url = xhr.responseURL;
          chrome.storage.local.set(metadata);
        }
      } else {
        onError('NOT_FOUND');
      }
    };
    xhr.onerror = function() {
      onError('NOT_FOUND');
    };
    xhr.send();
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
var options = { fileSystemId: bucketName+Math.random(), displayName: 'gs://'+bucketName };
chrome.fileSystemProvider.mount(options, function() {
  console.log(chrome.runtime.lastError);
});
