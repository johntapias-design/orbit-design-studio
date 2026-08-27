/**
 * Orbit Core Design System Bridge
 *
 * Reads portable Core Framework `.core` files without changing the Orbit node
 * tree. The compressed-file decoder is adapted from lz-string 1.5.0
 * (Copyright 2013 Pieroxy, MIT License).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to inclusion of this copyright and permission
 * notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */
const ORBIT_CORE_BRIDGE_LIMITS=Object.freeze({sourceBytes:8*1024*1024,maxTokens:2000});

function coreBridgeLzDecompress(length,resetValue,getNextValue){
  const fromCharCode=String.fromCharCode,dictionary=[];let next,enlargeIn=4,dictSize=4,numBits=3,entry='',result=[],i,w,bits,resb,maxpower,power,c;
  const data={val:getNextValue(0),position:resetValue,index:1};
  for(i=0;i<3;i+=1)dictionary[i]=i;
  bits=0;maxpower=4;power=1;
  while(power!==maxpower){resb=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNextValue(data.index++);}bits|=(resb>0?1:0)*power;power<<=1;}
  next=bits;
  if(next===0){bits=0;maxpower=256;power=1;while(power!==maxpower){resb=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNextValue(data.index++);}bits|=(resb>0?1:0)*power;power<<=1;}c=fromCharCode(bits);}
  else if(next===1){bits=0;maxpower=65536;power=1;while(power!==maxpower){resb=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNextValue(data.index++);}bits|=(resb>0?1:0)*power;power<<=1;}c=fromCharCode(bits);}
  else return '';
  dictionary[3]=c;w=c;result.push(c);
  while(true){
    if(data.index>length)return '';
    bits=0;maxpower=Math.pow(2,numBits);power=1;
    while(power!==maxpower){resb=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNextValue(data.index++);}bits|=(resb>0?1:0)*power;power<<=1;}
    c=bits;
    if(c===0){bits=0;maxpower=256;power=1;while(power!==maxpower){resb=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNextValue(data.index++);}bits|=(resb>0?1:0)*power;power<<=1;}dictionary[dictSize++]=fromCharCode(bits);c=dictSize-1;enlargeIn--;}
    else if(c===1){bits=0;maxpower=65536;power=1;while(power!==maxpower){resb=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNextValue(data.index++);}bits|=(resb>0?1:0)*power;power<<=1;}dictionary[dictSize++]=fromCharCode(bits);c=dictSize-1;enlargeIn--;}
    else if(c===2)return result.join('');
    if(enlargeIn===0){enlargeIn=Math.pow(2,numBits);numBits++;}
    if(dictionary[c])entry=dictionary[c];else if(c===dictSize)entry=w+w.charAt(0);else return null;
    result.push(entry);dictionary[dictSize++]=w+entry.charAt(0);enlargeIn--;w=entry;
    if(enlargeIn===0){enlargeIn=Math.pow(2,numBits);numBits++;}
  }
}

function decodeCoreFrameworkFile(source=''){
  const compressed=String(source||'');
  if(!compressed)return '';
  return coreBridgeLzDecompress(compressed.length,16384,index=>compressed.charCodeAt(index)-32)||'';
}

function coreBridgeRound(value){return Number(Number(value).toFixed(2));}
function coreBridgeLength(value,useRem,rootSize){const number=coreBridgeRound(Number(value));return `${useRem?coreBridgeRound(number/rootSize):number}${useRem?'rem':'px'}`;}
function coreBridgeVariableName(namingConvention='token',step='m'){
  const base=String(namingConvention||'token').replace('{step}',step).replace(/\s+/g,'-');
  return `--${base}${String(namingConvention).includes('{step}')?'':`-${step}`}`.replace(/^----/,'--');
}
function coreBridgeLabel(cssVar=''){
  return String(cssVar).replace(/^--/,'').replace(/[-_]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
}
function coreBridgeCategory(cssVar='',value='',hint=''){
  if(['colors','typography','spacing','radius','shadows'].includes(hint))return hint;
  const name=String(cssVar).toLowerCase(),raw=String(value).toLowerCase();
  if(/shadow/.test(name)||/\d+(?:\.\d+)?(?:px|rem)\s+\d+(?:\.\d+)?(?:px|rem).*(?:rgba?|hsla?|#)/.test(raw))return 'shadows';
  if(/radius|round|corner/.test(name))return 'radius';
  if(/color|brand|primary|secondary|accent|surface|background|foreground|muted|neutral|black|white/.test(name)||/^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/.test(raw))return 'colors';
  if(/font|text|type|heading|body|display|line-height|letter/.test(name)||/font-family/.test(raw))return 'typography';
  return 'spacing';
}
function coreBridgeNormalizeItem(cssVar,value,category='',source='core'){
  const variable=String(cssVar||'').trim().replace(/^([^\-])/,match=>`--${match}`);
  const raw=String(value??'').trim();
  if(!/^--[A-Za-z0-9_-]+$/.test(variable)||!raw)return null;
  return {cssVar:variable,value:raw,category:coreBridgeCategory(variable,raw,category),key:variable.replace(/^--/,''),name:coreBridgeLabel(variable),source};
}
function coreBridgeCssVariables(css='',hint='',source='stylesheet'){
  const items=[];const re=/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);?/g;let match;
  while((match=re.exec(String(css||'')))){const item=coreBridgeNormalizeItem(match[1],match[2],hint,source);if(item)items.push(item);}
  return items;
}

function coreBridgeFluidValue(minSize,maxSize,minScreen,maxScreen,useRem,rootSize){
  const span=maxScreen-minScreen;
  if(!Number.isFinite(span)||span<=0)return coreBridgeLength(minSize,useRem,rootSize);
  const slope=(maxSize-minSize)/span,preferredVw=`${coreBridgeRound(slope*100)}vw`,intercept=minSize-slope*minScreen;
  return `clamp(${coreBridgeLength(minSize,useRem,rootSize)}, calc(${preferredVw} + ${coreBridgeLength(intercept,useRem,rootSize)}), ${coreBridgeLength(maxSize,useRem,rootSize)})`;
}
function coreBridgeScaleItems(data,kind,preferences={}){
  if(!data||data.isDisabled||!Array.isArray(data.groups))return [];
  const items=[],rootSize=Math.max(1,Number(preferences.root_font_size)||16),minScreen=Number(preferences.min_screen_width)||320,maxScreen=Number(preferences.max_screen_width)||1400,useRem=preferences.is_rem!==false;
  data.groups.forEach(group=>{
    if(!group||group.isDisabled)return;
    const hint=kind==='typography'?'typography':'spacing';
    if(group.mode==='fluid_manual'&&Array.isArray(group.manualSizes)&&group.manualSizes.length){
      group.manualSizes.forEach(size=>{
        const cssVar=`--${String(size.name||'').replace(/^--/,'')}`;
        const value=String(size.css||'').trim()||coreBridgeFluidValue(Number(size.min)||0,Number(size.max)||0,minScreen,maxScreen,useRem,rootSize);
        const item=coreBridgeNormalizeItem(cssVar,value,hint,'core-scale');if(item)items.push(item);
      });
      return;
    }
    const steps=String(group.steps||'').split(',').map(step=>step.trim()).filter(Boolean),baseIndex=Number(group.baseScaleIndex)||0;
    const minConfig=group.min||{},maxConfig=group.max||{};
    const minBase=Number(kind==='typography'?minConfig.fontSize:minConfig.size),maxBase=Number(kind==='typography'?maxConfig.fontSize:maxConfig.size);
    const minRatio=Number(minConfig.isCustomScaleRatio&&minConfig.scaleRatioInputValue?minConfig.scaleRatioInputValue:minConfig.scaleRatio)||1;
    const maxRatio=Number(maxConfig.isCustomScaleRatio&&maxConfig.scaleRatioInputValue?maxConfig.scaleRatioInputValue:maxConfig.scaleRatio)||1;
    if(!Number.isFinite(minBase)||!Number.isFinite(maxBase))return;
    steps.forEach((step,index)=>{
      const offset=index-baseIndex,minSize=minBase*Math.pow(minRatio,offset),maxSize=maxBase*Math.pow(maxRatio,offset);
      const cssVar=coreBridgeVariableName(group.namingConvention||kind,step);
      const item=coreBridgeNormalizeItem(cssVar,coreBridgeFluidValue(minSize,maxSize,minScreen,maxScreen,useRem,rootSize),hint,'core-scale');if(item)items.push(item);
    });
  });
  return items;
}

function coreBridgeColorItems(colorSystem){
  if(!colorSystem||colorSystem.isDisabled||!Array.isArray(colorSystem.groups))return {items:[],darkCount:0,variantCount:0};
  const items=[];let darkCount=0,variantCount=0;
  colorSystem.groups.forEach(group=>{
    if(!group||group.isDisabled||!Array.isArray(group.colors))return;
    group.colors.forEach(color=>{
      if(!color||!color.name||!color.value)return;
      const base=coreBridgeNormalizeItem(`--${color.name}`,color.value,'colors','core-color');if(base)items.push(base);
      if(color.darkValue)darkCount++;
      for(const key of ['shades','tints'])for(const variant of Array.isArray(color[key])?color[key]:[]){const item=coreBridgeNormalizeItem(`--${variant.name}`,variant.value,'colors','core-color-variant');if(item)items.push(item);}
      if(Array.isArray(color.transparentVariables))variantCount+=color.transparentVariables.length;
    });
  });
  return {items,darkCount,variantCount};
}

function coreBridgeFontItems(fontsData){
  if(!fontsData||fontsData.isDisabled||!Array.isArray(fontsData.fonts))return [];
  return fontsData.fonts.flatMap(font=>{
    if(!font||font.enable===false||!font.customVariable||!font.family)return [];
    const cssVar=`--${String(font.customVariable).replace(/^--/,'')}`,family=/\s/.test(font.family)?`"${font.family}"`:font.family;
    const item=coreBridgeNormalizeItem(cssVar,family,'typography','core-font');return item?[item]:[];
  });
}

function coreBridgeStyleSheetItems(styleSheetData){
  if(!styleSheetData||typeof styleSheetData!=='object')return [];
  const items=[];const hints={colorStyles:'colors',typographyStyles:'typography',spacingStyles:'spacing'};
  Object.entries(styleSheetData).forEach(([section,value])=>{
    const hint=hints[section]||'';
    (function visit(entry){
      if(Array.isArray(entry)){entry.forEach(visit);return;}
      if(!entry||typeof entry!=='object')return;
      if(entry.isDisabled)return;
      if(Array.isArray(entry.declarations))entry.declarations.forEach(declaration=>{const item=coreBridgeNormalizeItem(declaration?.property,declaration?.value,hint,'core-stylesheet');if(item)items.push(item);});
      Object.entries(entry).forEach(([key,child])=>{if(key!=='declarations')visit(child);});
    })(value);
  });
  return items;
}

function extractCoreDesignSystemTokens(preset={}){
  const modules=preset.modulesData||{},preferences=preset.preferences||{},warnings=[];
  const colorResult=coreBridgeColorItems(modules.COLOR_SYSTEM);
  const candidates=[
    ...colorResult.items,
    ...coreBridgeScaleItems(modules.FLUID_TYPOGRAPHY,'typography',preferences),
    ...coreBridgeScaleItems(modules.FLUID_SPACING,'spacing',preferences),
    ...coreBridgeFontItems(modules.FONTS),
    ...coreBridgeStyleSheetItems(preset.styleSheetData),
  ];
  const rawStylesheets=modules.STYLESHEETS;
  if(rawStylesheets&&!rawStylesheets.isDisabled&&Array.isArray(rawStylesheets.groups))rawStylesheets.groups.forEach(group=>{if(group?.isActive!==false)candidates.push(...coreBridgeCssVariables(group?.css||'','','core-custom-css'));});
  if(colorResult.darkCount)warnings.push(`${colorResult.darkCount} colores incluyen modo oscuro; Orbit importará su valor principal.`);
  if(colorResult.variantCount)warnings.push(`${colorResult.variantCount} transparencias calculadas permanecerán en Core Framework.`);
  const byVariable=new Map();
  candidates.forEach(item=>{if(item)byVariable.set(item.cssVar,item);});
  const items=[...byVariable.values()].slice(0,ORBIT_CORE_BRIDGE_LIMITS.maxTokens);
  if(byVariable.size>items.length)warnings.push(`Se aplicó el límite de ${ORBIT_CORE_BRIDGE_LIMITS.maxTokens} tokens por importación.`);
  return {items,warnings,stats:{colors:items.filter(item=>item.category==='colors').length,typography:items.filter(item=>item.category==='typography').length,spacing:items.filter(item=>item.category==='spacing').length,other:items.filter(item=>!['colors','typography','spacing'].includes(item.category)).length}};
}

function parseCoreDesignSystemSource(source,{filename=''}={}){
  const raw=String(source||'');
  if(!raw.trim())return {ok:false,error:'El archivo está vacío.'};
  if(new TextEncoder().encode(raw).length>ORBIT_CORE_BRIDGE_LIMITS.sourceBytes)return {ok:false,error:'El archivo .core supera el límite seguro de 8 MB.'};
  let preset=null,format='core';
  const jsonSource=raw.replace(/^\uFEFF/,'').trim();
  try{preset=JSON.parse(jsonSource);format='core-json';}catch{
    try{const decoded=decodeCoreFrameworkFile(raw);preset=JSON.parse(decoded);}catch{return {ok:false,error:'No se pudo leer el archivo .core. Verifica que sea una exportación válida de Core Framework.'};}
  }
  if(!preset||typeof preset!=='object'||Array.isArray(preset)||(!preset.modulesData&&!preset.styleSheetData))return {ok:false,error:'El archivo no contiene un proyecto compatible de Core Framework.'};
  const extracted=extractCoreDesignSystemTokens(preset);
  if(!extracted.items.length)return {ok:false,error:'El proyecto Core no contiene variables compatibles para importar.'};
  return {ok:true,format,filename:String(filename||''),projectName:String(preset.name||'Core Framework'),appVersion:String(preset.app_version||''),items:extracted.items,warnings:extracted.warnings,stats:extracted.stats};
}
