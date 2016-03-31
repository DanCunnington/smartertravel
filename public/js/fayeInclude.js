var hostname = window.location.hostname;
console.log(hostname);
$.getScript('http://'+hostname+'/faye/client.js');