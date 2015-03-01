var assert = require('assert');
var _ = require('lodash');
var boot = require('loopback-boot');
var debug = require('debug')('MeshModels.client');
var loopback = require('loopback');
var request = require('request');
var url = require('url');
var util = require('util');

function Client(apiUrl) {
  // Normalize the URI
  var endpoint = url.parse(apiUrl);
  debug('normalize endpoint %j', endpoint);

  if (endpoint.protocol === 'http+unix:') {
    // Convert from our CLI format to the format request wants.
    this.apiUrl = util.format('http://unix:%s:/api', endpoint.pathname);
  } else if (endpoint.protocol === 'http:') {
    endpoint.pathname = '/api'; // Loopback is mounted here
    endpoint.hostname = endpoint.hostname || 'localhost'; // Allow http://:8888
    delete endpoint.host; // So .hostname and .port are used to construct URL
    this.apiUrl = url.format(endpoint);
  } else {
    throw Error('Unknown protocol: ' + endpoint.protocol + '//');
  }
  debug('connecting to %s', this.apiUrl);

  var client = loopback();
  client.dataSource('remote', {'connector': 'remote', 'url': this.apiUrl});
  boot(client, __dirname);

  this.loopback = client;
  this.models = client.models;

  // Resolve the models
  client.models();
}
module.exports = Client;

function serviceCreate(name, scale, callback) {
  var Service = this.models.ServerService;

  if (scale == null) scale = 1;
  var service = {name: name, _groups: [{id: 1, name: 'default', scale: scale}]};
  Service.create(service, callback);

  return this;
}
Client.prototype.serviceCreate = serviceCreate;

function serviceList(callback) {
  var Service = this.models.ServerService;
  return Service.find({order: ['id ASC']}, callback);
}
Client.prototype.serviceList = serviceList;

function serviceDestroy(name, callback) {
  var Service = this.models.ServerService;

  var q = {where: {name: name}};
  Service.findOne(q, function(err, service) {
    if (err || !service) return callback(err, service);

    Service.deleteById(service.id, callback);
  });

  return this;
}
Client.prototype.serviceDestroy = serviceDestroy;

function groupCreate(serviceNameOrId, groupName, scale, callback) {
  var Service = this.models.ServerService;
  var filter = {
    where: {
      or: [
        {name: serviceNameOrId},
        {id: serviceNameOrId}
      ]
    }
  };
  Service.findOne(filter, function(err, service) {
    if (!service) {
      // We could create it, but then it wouldn't have a default. Until further
      // requirements, groups can only be set on existing services.
      return callback(err, service);
    }

    debug('groupCreate before: %j', service);

    var group = _.find(service._groups, {name: groupName});

    if (group) {
      group.scale = scale;
    } else {
      service._groups.push({name: groupName, scale: scale});
    }

    debug('groupCreate after: %j', service);

    service.save(function(err, s) {
      if (!err) assert(s);
      callback(err, service);
    });
  });

  return this;
}
Client.prototype.groupCreate = groupCreate;

function instanceList(serviceNameOrId, callback) {
  var Service = this.models.ServerService;
  var ServiceInstance = this.models.ServiceInstance;
  var filter = {
    where: {
      or: [
        {name: serviceNameOrId},
        {id: serviceNameOrId}
      ]
    }
  };
  Service.findOne(filter, function(err, service) {
    if (err || !service) return callback(err, service);

    var q = {where: {serverServiceId: service.id}, order: ['id ASC']};
    ServiceInstance.find(q, callback);
  });
}
Client.prototype.instanceList = instanceList;

function runCommand(instance, req, callback) {
  instance.actions.create({
    request: req
  }, function(err, action) {
    if (err) return callback(err);
    if (action.result && action.result.error)
      return callback(Error(action.result.error));

    callback(null, action.result);
  });
}
Client.prototype.runCommand = runCommand;

function downloadProfile(instance, profileId, callback) {
  var self = this;
  var Service = this.models.ServerService;

  Service.findById(instance.serverServiceId, function(err, service) {
    if (err) return callback(err);

    service.profileDatas.findById(profileId, function(err, profile) {
      if (err) return callback(err);
      if (!profile) return callback(Error('Profile ' +
      profileId +
      ' not found'));

      var url = util.format('%s/services/%s/profileDatas/%s/download',
        self.apiUrl,
        service.id,
        profile.id);
      var req = request.get(url);

      // using events instead of callback interface to work around an issue
      // where GETing the file over unix domain sockets would return an empty
      // stream
      req.on('response', function(rsp) {
        if (callback) callback(null, rsp);
        callback = null;
      });
      req.on('error', function(err) {
        if (callback) callback(err);
        callback = null;
      });
    });
  });
}
Client.prototype.downloadProfile = downloadProfile;

function getDeployEndpoint(service) {
  return util.format('%s/services/%s/deploy', this.apiUrl, service.id);
}
Client.prototype.getDeployEndpoint = getDeployEndpoint;

function serviceDeploy(service, contentType, callback) {
  var url = this.getDeployEndpoint(service);
  return request.put(url, {headers: {'content-type': contentType}}, callback);
}
Client.prototype.serviceDeploy = serviceDeploy;

function serviceGetArtifact(service, callback) {
  var url = util.format('%s/services/%s/pack', this.apiUrl, service.id);
  request.get(url, callback);
}
Client.prototype.serviceGetArtifact = serviceGetArtifact;
