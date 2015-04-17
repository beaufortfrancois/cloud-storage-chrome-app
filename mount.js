var input = document.querySelector('input');
var button = document.querySelector('button');

function mount(bucket, callback) {
  var options = { fileSystemId: bucket, displayName: 'gs://' + bucket };
  chrome.fileSystemProvider.mount(options, function() {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    }
    callback();
  });
}

function submit() {
  var bucket = input.value.trim();
  if (bucket.indexOf('gs://') === 0) {
    bucket = bucket.substr('gs://'.length);
  }
  if (!bucket) {
    return;
  }
  mount(bucket, function() {
    getLastBuckets(function(lastBuckets) {
      if (lastBuckets.length === 0 || 
          bucket !== lastBuckets[0]) {
        lastBuckets.unshift(bucket);
      }
      setLastBuckets(lastBuckets, function() {
        window.close();
      });
    });
  });
}

button.addEventListener('click', submit);
input.addEventListener('keyup', function(event) {
  if (event.keyCode === 13) {
    submit();
  }
});

function submitLastBucket(event) {
  var index = 0;
  var bucket = 'gs://' + event.target.textContent;
  var type = function() {
    input.value = input.value + bucket[index];
    index++;
    if (index === bucket.length) {
      submit();
    } else {
      requestAnimationFrame(type);
    }
  }
  type();
}

function getLastBuckets(callback) {
  chrome.storage.local.get('lastBuckets', function(data) {
    var lastBuckets = data.lastBuckets || [];
    callback(lastBuckets);
  });
}

function setLastBuckets(lastBuckets, callback) {
  chrome.storage.local.set({'lastBuckets': lastBuckets}, callback);
}

getLastBuckets(function(lastBuckets) {
  lastBuckets.forEach(function(bucket) {
    var row = document.createElement('span');
    row.textContent = bucket;
    row.addEventListener('click', submitLastBucket);
    document.querySelector('#lastBuckets').appendChild(row);
  });
});
