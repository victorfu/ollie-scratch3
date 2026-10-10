import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lessonParam,findLesson,withLesson} from '../lib/lesson-param';

const examples=[{title:'第05課_鍵盤讓舞者換動作'},{title:'第28課_完成作品'},{title:'my-folder/自己的作品'}];

test('lesson numbers name numbered lessons; other examples keep their title',()=>{
 assert.equal(lessonParam('第05課_鍵盤讓舞者換動作'),'5');
 assert.equal(lessonParam('第28課_完成作品'),'28');
 assert.equal(lessonParam('my-folder/自己的作品'),'my-folder/自己的作品');
});

test('a lesson is found by number (with or without leading zeros) or by exact title',()=>{
 assert.equal(findLesson(examples,'28')?.title,'第28課_完成作品');
 assert.equal(findLesson(examples,'5')?.title,'第05課_鍵盤讓舞者換動作');
 assert.equal(findLesson(examples,'05')?.title,'第05課_鍵盤讓舞者換動作');
 assert.equal(findLesson(examples,'my-folder/自己的作品')?.title,'my-folder/自己的作品');
 assert.equal(findLesson(examples,'99'),undefined);
 assert.equal(findLesson(examples,'完成作品'),undefined);
});

test('the URL keeps other parameters while lesson is set or removed',()=>{
 assert.equal(withLesson('http://localhost:3000/?debug=1','28'),'/?debug=1&lesson=28');
 assert.equal(withLesson('http://localhost:3000/?lesson=5&debug=1','28'),'/?lesson=28&debug=1');
 assert.equal(withLesson('http://localhost:3000/?lesson=5&debug=1',null),'/?debug=1');
 assert.equal(withLesson('http://localhost:3000/?lesson=5',null),'/');
 assert.equal(decodeURIComponent(withLesson('http://localhost:3000/','my-folder/自己的作品')),'/?lesson=my-folder/自己的作品');
});
