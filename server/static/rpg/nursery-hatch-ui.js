(function(){
	'use strict';
	const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
	const delay=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
	const eggSprite=(options,cls)=>{const img=el('img',cls);img.src=options.spriteUrl({species:'Egg'});img.alt='Egg';img.draggable=false;return img;};
	function particles(){const host=el('span','rpg-hatch-particles');for(let i=0;i<14;i++){const p=el('i');p.style.setProperty('--hatch-angle',(i*360/14)+'deg');p.style.setProperty('--hatch-delay',((i%4)*.06)+'s');host.append(p);}return host;}
	async function play(options,egg,requestHatch){
		const portable=!!egg?.portableIncubator;
		const layer=el('div','rpg-hatch-dialog');
		const card=el('section','rpg-hatch-card '+(portable?'portable':'standard'));
		const heading=el('h2','',portable?'A incubadora está reagindo...':'O Egg está se mexendo...');
		const message=el('p','rpg-hatch-message',portable?'Clique na incubadora para abri-la.':'Clique no Egg para iniciar a eclosão.');
		const stage=el('div','rpg-hatch-stage');
		const trigger=el('button','rpg-hatch-trigger');trigger.type='button';trigger.setAttribute('aria-label',portable?'Abrir incubadora e chocar Egg':'Chocar Egg');
		const eggHost=el('span','rpg-hatch-egg-host');
		eggHost.append(eggSprite(options,'rpg-hatch-egg-core'),eggSprite(options,'rpg-hatch-shell-half left'),eggSprite(options,'rpg-hatch-shell-half right'));
		const cracks=el('span','rpg-hatch-cracks');for(let i=0;i<5;i++)cracks.append(el('i'));eggHost.append(cracks);
		if(portable){
			const visual=options.portableIncubatorVisual(false,'rpg-hatch-incubator-source');
			const src=visual.querySelector('.portable-incubator-shell')?.src||'';
			const machine=el('span','rpg-hatch-incubator');
			for(const name of ['lid','base']){const part=el('span','rpg-hatch-incubator-part '+name);const img=el('img');img.src=src;img.alt='';part.append(img);machine.append(part);}
			machine.append(eggHost);trigger.append(machine);
		}else trigger.append(eggHost);
		stage.append(trigger,el('span','rpg-hatch-light'),el('span','rpg-hatch-flash'),particles());
		const actions=el('div','rpg-hatch-actions');const next=el('button','button primary','Continuar');next.type='button';next.hidden=true;actions.append(next);
		card.append(heading,stage,message,actions);layer.append(card);document.body.append(layer);
		return new Promise((resolve,reject)=>{
			let started=false,result;
			trigger.addEventListener('click',async()=>{
				if(started)return;started=true;trigger.disabled=true;card.classList.add('started');message.textContent=portable?'A incubadora está abrindo...':'O Egg começou a se mexer...';
				const request=Promise.resolve().then(requestHatch).then(result=>({result}),error=>({error}));
				if(portable){card.classList.add('opening-incubator');await delay(1050);card.classList.add('incubator-open');}
				card.classList.add('cracking');message.textContent='O Egg está rachando!';await delay(2600);
				try{const outcome=await request;if(outcome.error)throw outcome.error;result=outcome.result;}catch(error){layer.remove();reject(error);return;}
				const pokemon=result?.hatch?.pokemon;const sprite=el('img','rpg-hatch-pokemon');sprite.src=options.spriteUrl(pokemon||{species:'Pokemon'});sprite.alt=pokemon?.species||'Pokémon recém-nascido';sprite.draggable=false;stage.append(sprite);
				card.classList.add('revealing');window.RPGBattleAudio?.playEffect('evolution');await delay(1050);card.classList.add('hatched');window.RPGBattleAudio?.playCry(pokemon?.species||'',{baseId:pokemon?.species||''});
				heading.textContent=(pokemon?.species||'O Pokémon')+' nasceu!';message.textContent='O Pokémon saiu do Egg e foi colocado na sua equipe.';next.hidden=false;next.focus();
			});
			next.addEventListener('click',()=>{layer.remove();resolve(result);});
		});
	}
	window.RPGNurseryHatch=Object.freeze({play});
})();
