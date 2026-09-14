// Parsing for the CSS forms consumed by the native Canvas backend.
pub fn alpha(value:&str)->Option<f64>{
    let (_,tail)=value.split_once('/')?;
    let tail=tail.trim().strip_suffix(')')?.trim();
    let a=if let Some(p)=tail.strip_suffix('%'){p.trim().parse::<f64>().ok()?/100.0}else{tail.parse::<f64>().ok()?};
    a.is_finite().then_some(a.clamp(0.0,1.0))
}

pub fn font(value: &str) -> Option<String> {
    // Keep quoted family names intact; malformed quoting is rejected.
    let mut tokens=Vec::new();let mut token=String::new();let mut quote=None;
    for ch in value.chars(){
        if let Some(q)=quote{token.push(ch);if ch==q{quote=None;}}
        else if ch=='\''||ch=='"'{quote=Some(ch);token.push(ch);}
        else if ch.is_ascii_whitespace(){if !token.is_empty(){tokens.push(std::mem::take(&mut token));}}
        else{token.push(ch);}
    }
    if quote.is_some(){return None;}if !token.is_empty(){tokens.push(token);}
    let (mut style,mut variant,mut weight)=(None,None,None);
    for (i,token) in tokens.iter().enumerate(){
        let lower=token.to_ascii_lowercase();
        let size_token=lower.split('/').next()?;
        let units=[("px",1.0),("pt",96.0/72.0),("pc",16.0),("in",96.0),("cm",96.0/2.54),("mm",96.0/25.4),("q",96.0/101.6)];
        if let Some((number,scale))=units.iter().find_map(|(u,s)|size_token.strip_suffix(u).map(|n|(n,*s))){
            let size=number.parse::<f64>().ok()?*scale;
            if !size.is_finite()||size<0.0{return None;}
            let family=tokens.get(i+1..)?.join(" ");
            if family.is_empty(){return None;}
            // Family grammar: quoted names or CSS identifiers separated by commas.
            let mut quoted=None;let mut part=String::new();let mut families=Vec::new();
            for ch in family.chars(){
                if let Some(q)=quoted{part.push(ch);if ch==q{quoted=None;}}
                else if ch=='\''||ch=='"'{quoted=Some(ch);part.push(ch);}
                else if ch==','{families.push(std::mem::take(&mut part));}
                else{part.push(ch);}
            }
            families.push(part);
            for part in &families{
                let p=part.trim();if p.is_empty(){return None;}
                if p.starts_with(['\'', '"']){
                    let q=p.chars().next()?;if p.len()<2||!p.ends_with(q){return None;}
                }else if !p.split_whitespace().all(|word|{
                    let mut chars=word.chars();chars.next().map(|c|c.is_alphabetic()||c=='_'||c=='-').unwrap_or(false)
                        &&chars.all(|c|c.is_alphanumeric()||c=='_'||c=='-')
                }){return None;}
            }
            if let Some(line)=lower.split_once('/').map(|(_,line)|line){
                let n=line.trim_end_matches(|c:char|c.is_ascii_alphabetic()||c=='%');
                if line!="normal"&&n.parse::<f64>().map(|n|!n.is_finite()||n<0.0).unwrap_or(true){return None;}
            }
            let mut result=Vec::new();
            if let Some(s)=style{result.push(s);}if let Some(v)=variant{result.push(v);}if let Some(w)=weight{result.push(w);}
            result.push(format!("{}px",size));result.push(families.iter().map(|f|f.trim()).collect::<Vec<_>>().join(", "));
            return Some(result.join(" "));
        }
        match lower.as_str(){
            "normal"=>{},
            "italic"|"oblique"=>{if style.is_some(){return None;}style=Some(lower);},
            "small-caps"=>{if variant.is_some(){return None;}variant=Some(lower);},
            "bold"|"bolder"|"lighter"=>{if weight.is_some(){return None;}weight=Some(lower);},
            _=>{let n=lower.parse::<u32>().ok()?;if !(1..=1000).contains(&n)||weight.is_some(){return None;}weight=Some(lower);}
        }
    }
    None
}

pub fn function_color(value:&str)->Option<[u8;4]>{
    let (name,body)=value.split_once('(')?;let body=body.strip_suffix(')')?;
    if !["rgb","rgba","hsl","hsla"].contains(&name){return None;}
    let modern=!body.contains(',');
    if modern{
        let parts=body.split('/').collect::<Vec<_>>();
        if parts.len()>2||parts[0].split_whitespace().count()!=3||(parts.len()==2&&parts[1].split_whitespace().count()!=1){return None;}
    }
    let fields:Vec<&str>=if modern{body.split(|c:char|c.is_ascii_whitespace()||c=='/').filter(|v|!v.is_empty()).collect()}else{body.split(',').map(str::trim).collect()};
    if fields.len()!=3&&fields.len()!=4{return None;}
    let numeric=|s:&str|->Option<f64>{let n=s.parse::<f64>().ok()?;n.is_finite().then_some(n)};
    let alpha=if fields.len()==4{
        if let Some(p)=fields[3].strip_suffix('%'){
            let v=numeric(p)?.clamp(0.0,100.0)*255.0/100.0;
            if modern{v.floor() as u8}else{v.round() as u8}
        }else{(numeric(fields[3])?.clamp(0.0,1.0)*255.0).round() as u8}
    }else{255};
    if name.starts_with("rgb"){
        let channel=|s:&str|->Option<u8>{Some(if let Some(p)=s.strip_suffix('%'){(numeric(p)?.clamp(0.0,100.0)*255.0/100.0).round() as u8}else{numeric(s)?.clamp(0.0,255.0).round() as u8})};
        return Some([channel(fields[0])?,channel(fields[1])?,channel(fields[2])?,alpha]);
    }
    let hue=fields[0];
    let angle=if let Some(n)=hue.strip_suffix("deg"){numeric(n)?}else if let Some(n)=hue.strip_suffix("grad"){numeric(n)?*0.9}
        else if let Some(n)=hue.strip_suffix("rad"){numeric(n)?.to_degrees()}else if let Some(n)=hue.strip_suffix("turn"){numeric(n)?*360.0}else{numeric(hue)?};
    let h=angle.rem_euclid(360.0)/60.0;
    let s=numeric(fields[1].strip_suffix('%')?)?.clamp(0.0,100.0)/100.0;
    let l=numeric(fields[2].strip_suffix('%')?)?.clamp(0.0,100.0)/100.0;
    let c=(1.0-(2.0*l-1.0).abs())*s;let x=c*(1.0-(h%2.0-1.0).abs());let m=l-c/2.0;
    let rgb=match h as u32{0=>[c,x,0.0],1=>[x,c,0.0],2=>[0.0,c,x],3=>[0.0,x,c],4=>[x,0.0,c],_=>[c,0.0,x]};
    Some([((rgb[0]+m)*255.0).round() as u8,((rgb[1]+m)*255.0).round() as u8,((rgb[2]+m)*255.0).round() as u8,alpha])
}
