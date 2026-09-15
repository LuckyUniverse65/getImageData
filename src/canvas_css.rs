// Parsing for the CSS forms consumed by the native Canvas backend.
fn number(value:&str)->Option<f64>{
    let b=value.as_bytes();let mut i=0;
    if matches!(b.get(i),Some(b'+')|Some(b'-')){i+=1;}
    let start=i;while b.get(i).is_some_and(u8::is_ascii_digit){i+=1;}
    let integer=i>start;
    if b.get(i)==Some(&b'.'){
        i+=1;let start=i;while b.get(i).is_some_and(u8::is_ascii_digit){i+=1;}
        if i==start{return None;}
    }else if !integer{return None;}
    if matches!(b.get(i),Some(b'e')|Some(b'E')){
        i+=1;if matches!(b.get(i),Some(b'+')|Some(b'-')){i+=1;}
        let start=i;while b.get(i).is_some_and(u8::is_ascii_digit){i+=1;}
        if i==start{return None;}
    }
    if i!=b.len(){return None;}
    let n=value.parse::<f64>().ok()?;n.is_finite().then_some(n)
}
fn identifier(value:&str)->bool{
    let start=|c:char|c.is_ascii_alphabetic()||c=='_'||!c.is_ascii();
    let mut chars=value.chars();
    match chars.next(){Some('-')=>{if !chars.next().is_some_and(|c|start(c)||c=='-'){return false;}},Some(c) if start(c)=>{},_=>return false}
    chars.all(|c|start(c)||c.is_ascii_digit()||c=='-')
}
fn preprocess(value:&str)->String{
    let mut out=String::new();let mut chars=value.chars().peekable();let mut quote=None;
    while let Some(ch)=chars.next(){
        if let Some(q)=quote{
            if ch=='\\'{out.push(ch);if let Some(c)=chars.next(){out.push(if c=='\0'{'\u{fffd}'}else{c});}continue;}
            if ch==q{quote=None;}
        }else if ch=='\''||ch=='"'{quote=Some(ch);}
        else if ch=='/'&&chars.peek()==Some(&'*'){
            chars.next();while let Some(c)=chars.next(){if c=='*'&&chars.peek()==Some(&'/'){chars.next();break;}}
            out.push(' ');continue;
        }
        out.push(if ch=='\0'{'\u{fffd}'}else{ch});
    }
    out
}
fn family_string(value:&str)->Option<String>{
    let mut out=String::new();let mut chars=value.chars().peekable();
    while let Some(ch)=chars.next(){
        if ch=='\\'{
            let next=chars.next()?;
            if next.is_ascii_hexdigit(){
                let mut hex=String::from(next);
                while hex.len()<6&&chars.peek().is_some_and(char::is_ascii_hexdigit){hex.push(chars.next()?);}
                if chars.peek().is_some_and(char::is_ascii_whitespace){chars.next();}
                let n=u32::from_str_radix(&hex,16).ok()?;
                out.push(char::from_u32(n).filter(|c|*c!='\0').unwrap_or('\u{fffd}'));
            }else if next!='\n'&&next!='\r'{out.push(next);}
        }else if ch=='\n'||ch=='\r'{return None;}else{out.push(ch);}
    }
    Some(out)
}
fn serialize_family(value:&str)->String{
    if identifier(value)&&!value.starts_with("--"){return value.to_string();}
    let mut out=String::from("\"");
    for ch in value.chars(){
        if ch=='"'||ch=='\\'{out.push('\\');out.push(ch);}
        else if ch.is_ascii_control(){out.push_str(&format!("\\{:x} ",ch as u32));}
        else{out.push(ch);}
    }
    out.push('"');out
}
pub fn serialized_alpha(byte:u8)->f64{
    let alpha=byte as f64/255.0;
    let hundredths=(alpha*100.0).round()/100.0;
    if (hundredths*255.0).round() as u8==byte{hundredths}else{(alpha*1000.0).round()/1000.0}
}
pub fn alpha(value:&str)->Option<f64>{
    let value=preprocess(value);
    let (_,tail)=value.split_once('/')?;
    let tail=tail.trim().strip_suffix(')')?.trim();
    let a=if let Some(p)=tail.strip_suffix('%'){number(p.trim())?/100.0}else{number(tail)?};
    a.is_finite().then_some(a.clamp(0.0,1.0))
}

pub fn font(value: &str) -> Option<String> {
    let value=preprocess(value);
    // Keep quoted family names intact; malformed quoting is rejected.
    let mut tokens=Vec::new();let mut token=String::new();let mut quote=None;
    for ch in value.chars(){
        if let Some(q)=quote{token.push(ch);if ch==q{quote=None;}}
        else if ch=='\''||ch=='"'{quote=Some(ch);token.push(ch);}
        else if ch.is_ascii_whitespace()||ch=='/'{if !token.is_empty(){tokens.push(std::mem::take(&mut token));}if ch=='/'{tokens.push("/".to_string());}}
        else{token.push(ch);}
    }
    if quote.is_some(){return None;}if !token.is_empty(){tokens.push(token);}
    let (mut style,mut variant,mut weight)=(None,None,None);
    for (i,token) in tokens.iter().enumerate(){
        let lower=token.to_ascii_lowercase();
        let size_token=lower.split('/').next()?;
        let units=[("px",1.0),("pt",96.0/72.0),("pc",16.0),("in",96.0),("cm",96.0/2.54),("mm",96.0/25.4),("q",96.0/101.6)];
        if let Some((number,scale))=units.iter().find_map(|(u,s)|size_token.strip_suffix(u).map(|n|(n,*s))){
            let size=self::number(number)?*scale;
            if !size.is_finite()||size<0.0{return None;}
            if i>4{return None;}
            let mut family_index=i+1;
            if tokens.get(family_index).map(String::as_str)==Some("/"){
                let line=tokens.get(family_index+1)?.to_ascii_lowercase();
                if line!="normal"{
                    let numeric=if let Some(n)=line.strip_suffix('%'){n}else{
                        units.iter().find_map(|(unit,_)|line.strip_suffix(unit)).unwrap_or(&line)
                    };
                    let n=self::number(numeric)?;if n<0.0{return None;}
                }
                family_index+=2;
            }
            let family=tokens.get(family_index..)?.join(" ");
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
            for part in &mut families{
                let p=part.trim();if p.is_empty(){return None;}
                if p.starts_with(['\'', '"']){
                    let q=p.chars().next()?;
                    if p.len()<2||!p.ends_with(q)||p[1..p.len()-1].contains(q){return None;}
                    *part=serialize_family(&family_string(&p[1..p.len()-1])?);
                }else if !p.split_whitespace().all(identifier){return None;}
                else if p.starts_with("--"){*part=serialize_family(p);}
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
            _=>{let n=self::number(&lower)?;if !(1.0..=1000.0).contains(&n)||weight.is_some(){return None;}weight=Some((n.trunc() as u32).to_string());}
        }
    }
    None
}

pub fn function_color(value:&str)->Option<[u8;4]>{
    let value=preprocess(value);
    let (name,body)=value.split_once('(')?;let body=body.strip_suffix(')')?;
    if !["rgb","rgba","hsl","hsla"].contains(&name){return None;}
    let modern=!body.contains(',');
    if modern{
        let parts=body.split('/').collect::<Vec<_>>();
        if parts.len()>2||parts[0].split_whitespace().count()!=3||(parts.len()==2&&parts[1].split_whitespace().count()!=1){return None;}
    }
    let fields:Vec<&str>=if modern{body.split(|c:char|c.is_ascii_whitespace()||c=='/').filter(|v|!v.is_empty()).collect()}else{body.split(',').map(str::trim).collect()};
    if fields.len()!=3&&fields.len()!=4{return None;}
    if !modern && name.starts_with("rgb") && fields[..3].iter().any(|s|s.ends_with('%')!=fields[0].ends_with('%')){return None;}
    let numeric=number;
    let alpha=if fields.len()==4{
        if let Some(p)=fields[3].strip_suffix('%'){
            // CSS percent conversion uses a float scale; preserve that precision
            // through byte quantization (25% and 50% straddle different ties).
            let a=(numeric(p)?*f64::from(0.01f32)).clamp(0.0,1.0);
            (a*255.0).round() as u8
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
    let percent=|s:&str|->Option<f64>{numeric(if modern{s.strip_suffix('%').unwrap_or(s)}else{s.strip_suffix('%')?})};
    let s=percent(fields[1])?.clamp(0.0,100.0)/100.0;
    let l=percent(fields[2])?.clamp(0.0,100.0)/100.0;
    let c=(1.0-(2.0*l-1.0).abs())*s;let x=c*(1.0-(h%2.0-1.0).abs());let m=l-c/2.0;
    let rgb=match h as u32{0=>[c,x,0.0],1=>[x,c,0.0],2=>[0.0,c,x],3=>[0.0,x,c],4=>[x,0.0,c],_=>[c,0.0,x]};
    Some([((rgb[0]+m)*255.0).round() as u8,((rgb[1]+m)*255.0).round() as u8,((rgb[2]+m)*255.0).round() as u8,alpha])
}
