// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-mesh-models
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var assert = require('assert');
var exec = require('./exec-meshctl');
var test = require('tap').test;
var testCmdHelper = require('./meshctl-helper');
var util = require('util');
var ServiceManager = require('../index').ServiceManager;

test('Test object-tracking commands', function(t) {
  function TestServiceManager() {
  }
  util.inherits(TestServiceManager, ServiceManager);

  testCmdHelper(t, TestServiceManager, function(t, service, instance, port) {
    t.test('Setup service manager (start tracking)', function(tt) {
      function onCtlRequest(s, i, req, callback) {
        assert.deepEqual(req,
          {cmd: 'current', sub: 'start-tracking-objects', target: 1231});
        callback(null, {message: 'object tracking started'});
      }
      TestServiceManager.prototype.onCtlRequest = onCtlRequest;
      tt.end();
    });

    t.test('Start tracking API', function(tt) {
      instance.processes({where: {pid: 1231}}, function(err, proc) {
        tt.ifError(err, 'call should not error');
        proc = proc[0];
        instance.startObjectTracking(proc.id, function(err, response) {
          tt.ifError(err, 'call should not error');
          tt.equal(response.message,
            'object tracking started',
            'Response should match');
          tt.end();
        });
      });
    });

    t.test('Start tracking CLI', function(tt) {
      exec.resetHome();
      exec(port, 'objects-start 1', function(err, stdout) {
        tt.ifError(err, 'command should not error');
        tt.equal(stdout, '', 'Rendered output should match');
        tt.end();
      });
    });

    t.test('Setup service manager (stop tracking)', function(tt) {
      function onCtlRequest(s, i, req, callback) {
        assert.deepEqual(req,
          {cmd: 'current', sub: 'stop-tracking-objects', target: 1232});
        callback(null, {message: 'object tracking started'});
      }
      TestServiceManager.prototype.onCtlRequest = onCtlRequest;
      tt.end();
    });

    t.test('Stop tracking API', function(tt) {
      instance.processes({where: {pid: 1232}}, function(err, proc) {
        tt.ifError(err, 'call should not error');
        proc = proc[0];
        instance.stopObjectTracking(proc.id, 2, function(err, response) {
          tt.ifError(err, 'call should not error');
          tt.equal(response.message,
            'object tracking started',
            'Response should match');
          tt.end();
        });
      });
    });

    t.test('Stop tracking CLI', function(tt) {
      exec.resetHome();
      exec(port, 'objects-stop 2', function(err, stdout) {
        tt.ifError(err, 'command should not error');
        tt.equal(stdout, '', 'Rendered output should match');
        tt.end();
      });
    });

    t.test('Setup service manager (error case)', function(tt) {
      function onCtlRequest(s, i, req, callback) {
        assert.deepEqual(req,
          {cmd: 'current', sub: 'start-tracking-objects', target: 1233});
        callback(Error('Unable to start tracking'));
      }
      TestServiceManager.prototype.onCtlRequest = onCtlRequest;
      tt.end();
    });

    t.test('Start tracking API (error case)', function(tt) {
      instance.processes({where: {pid: 1233}}, function(err, proc) {
        tt.ifError(err, 'call should not error');
        proc = proc[0];
        instance.startObjectTracking(proc.id, function(err/* , response*/) {
          tt.ok(err, 'call should error');
          tt.end();
        });
      });
    });

    t.test('Start tracking CLI (error case)', function(tt) {
      exec.resetHome();
      exec(port, 'objects-start 3', function(err, stdout, stderr) {
        tt.ok(err, 'command should error');
        var patt = /Command "objects-start" on "\S+" failed with Error: Unable/;
        tt.match(stderr.toString(), patt, 'Rendered error should match');
        tt.end();
      });
    });
  });
});
