const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]),get=p=>require(path.join(root,p));
const {calendarMonthDays,shiftCalendarMonth,groupCalendarReleases}=get('lib/release-calendar.js');
assert.equal(shiftCalendarMonth('2026-12',1),'2027-01');
assert.equal(shiftCalendarMonth('2027-01',-1),'2026-12');
const leap=calendarMonthDays('2028-02');assert.ok(leap.includes('2028-02-29'));assert.equal(leap.length%7,0);
const dst=calendarMonthDays('2026-03');assert.ok(dst.includes('2026-03-29'));assert.ok(dst.includes('2026-03-30'));assert.equal(new Set(dst).size,dst.length);assert.equal(new Date(dst[0]+'T12:00:00Z').getUTCDay(),1);
assert.deepEqual(calendarMonthDays('bad'),[]);
const entries=[{id:'first',date:'2026-10-25'},{id:'second',date:'2026-10-25'},{id:'next',date:'2026-11-03'},{id:'old',date:'2026-10-19'},{id:'invalid',date:'2026-02-30'},{id:'undated'}];
const groups=groupCalendarReleases(entries,item=>item.date,'2026-10-20','2026-11-10');
assert.deepEqual([...groups.keys()],['2026-10-25','2026-11-03']);assert.equal(groups.get('2026-10-25').length,2);
const {cleanUpcomingFilters}=get('lib/upcoming.js');
assert.equal(cleanUpcomingFilters({layout:'calendar',section:'games'}).layout,'calendar');assert.equal(cleanUpcomingFilters({layout:'bad'}).layout,'cards');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Calendar=get('app/components/release-calendar.js').default;
const values=[];
function render(){
 let cursor=0;const originalState=React.useState,originalId=React.useId;
 React.useId=()=>`calendar-${cursor++}`;
 React.useState=initial=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;}];};
 let tree;try{tree=Calendar({items:entries,dateOf:item=>item.date,from:'2026-10-20',to:'2026-11-10',coverageNote:'Fixture selection only.',renderItems:items=>React.createElement('div',null,items.map(item=>React.createElement('p',{key:item.id},item.id)))});}finally{React.useState=originalState;React.useId=originalId;}
 const nodes=[];function walk(value){if(Array.isArray(value))return value.forEach(walk);if(value&&typeof value==='object'&&value.props){nodes.push(value);walk(value.props.children);}}walk(tree);
 return {html:renderToStaticMarkup(tree),nodes};
}
let page=render();
const button=(label)=>page.nodes.find(n=>n.type==='button'&&n.props['aria-label']===label);
assert.match(page.html,/October 2026/);assert.match(page.html,/2 releases listed for this date/);assert.equal(button('Previous month').props.disabled,true);
const emptyDate=page.nodes.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Monday, 26 October 2026'));
emptyDate.props.onClick();page=render();assert.match(page.html,/No releases listed for this date/);
button('Next month').props.onClick();page=render();assert.match(page.html,/November 2026/);assert.match(page.html,/1 release listed for this date/);assert.equal(button('Next month').props.disabled,true);
assert.match(page.html,/Fixture selection only/);assert.match(page.html,/aria-pressed="true"/);
const Upcoming=get('app/components/upcoming.js').default;
const props={filters:cleanUpcomingFilters({section:'games',layout:'calendar'}),onFilters(){},onServices(){},selected:[],feedback:[],offer:'all',isSaved:()=>false,onSave(){},onOpen(){},onFeedback(){}};
const enabled=renderToStaticMarkup(React.createElement(Upcoming,{...props,gaming:{platforms:[],collection:{},onStatus(){},onPlatform(){}}}));
assert.match(enabled,/aria-label="Release calendar"/);assert.match(enabled,/Announced game dates/);assert.ok(!enabled.includes('Gaming views'));
const disabled=renderToStaticMarkup(React.createElement(Upcoming,props));assert.ok(!disabled.includes('>Games</button>'));assert.ok(!disabled.includes('Announced game dates'));
console.log('PASS: Calendar month navigation, leap years, UK clock-change dates, release grouping, range boundaries, date selection, saved layout and Gaming opt-in.');
