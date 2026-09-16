// Parsing for the CSS forms consumed by the native Canvas backend.
fn number(value:&str)->Option<f64>{let n=parsed_number(value)?;n.is_finite().then_some(n)}
fn parsed_number(value:&str)->Option<f64>{
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
    value.parse::<f64>().ok()
}
fn identifier(value:&str)->bool{
    let start=|c:char|c.is_ascii_alphabetic()||c=='_'||!c.is_ascii();
    let mut chars=value.chars();
    match chars.next(){Some('-')=>{if !chars.next().is_some_and(|c|start(c)||c=='-'){return false;}},Some(c) if start(c)=>{},_=>return false}
    chars.all(|c|start(c)||c.is_ascii_digit()||c=='-')
}
pub fn preprocess(value:&str)->String{
    let value=value.replace("\r\n","\n").replace(['\r','\x0c'],"\n");
    let mut out=String::new();let mut chars=value.chars().peekable();let mut quote=None;
    while let Some(ch)=chars.next(){
        if ch=='\\'{out.push(ch);if let Some(c)=chars.next(){out.push(if c=='\0'{'\u{fffd}'}else{c});}continue;}
        if let Some(q)=quote{
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
fn wide_keyword(value:&str)->bool{
    matches!(value.to_ascii_lowercase().as_str(),"inherit"|"initial"|"unset"|"revert"|"revert-layer"|"default")
}
fn generic_family(value:&str)->bool{
    matches!(value.to_ascii_lowercase().as_str(),"serif"|"sans-serif"|"monospace"|"cursive"|"fantasy"|"system-ui"|"math"|"emoji"|"fangsong"|"ui-serif"|"ui-sans-serif"|"ui-monospace"|"ui-rounded")
}
// Preserve each escape as one token, including the optional hex terminator.
fn raw_escape(chars:&mut std::iter::Peekable<std::str::Chars<'_>>)->Option<String>{
    let mut out=String::from("\\");let next=chars.next()?;out.push(next);
    if next.is_ascii_hexdigit(){
        let mut count=1;while count<6&&chars.peek().is_some_and(char::is_ascii_hexdigit){out.push(chars.next()?);count+=1;}
        if chars.peek().is_some_and(char::is_ascii_whitespace){let c=chars.next()?;out.push(c);if c=='\r'&&chars.peek()==Some(&'\n'){out.push(chars.next()?);}}
    }
    Some(out)
}
fn font_tokens(value:&str)->Option<Vec<String>>{
    let mut tokens=Vec::new();let mut token=String::new();let mut quote=None;let mut chars=value.chars().peekable();
    while let Some(ch)=chars.next(){
        if ch=='\\'{token.push_str(&raw_escape(&mut chars)?);continue;}
        if let Some(q)=quote{token.push(ch);if ch==q{quote=None;}}
        else if ch=='\''||ch=='"'{quote=Some(ch);token.push(ch);}
        else if ch.is_ascii_whitespace()||ch=='/'{if !token.is_empty(){tokens.push(std::mem::take(&mut token));}if ch=='/'{tokens.push("/".to_string());}}
        else{token.push(ch);}
    }
    if quote.is_some(){return None;}if !token.is_empty(){tokens.push(token);}Some(tokens)
}
fn decoded_identifier(value:&str)->Option<String>{
    let mut mask=String::new();let mut chars=value.chars().peekable();
    while let Some(ch)=chars.next(){
        if ch=='\\'{let escape=raw_escape(&mut chars)?;if escape[1..].starts_with(['\n','\r','\x0c']){return None;}mask.push('_');}
        else{mask.push(ch);}
    }
    if !identifier(&mask){return None;}family_string(value)
}
fn serialize_family(value:&str)->String{
    // CSS-wide keywords are reserved regardless of case. Blink's generic
    // family serialization quotes only the canonical lowercase spelling.
    let reserved=wide_keyword(value)||(generic_family(value)&&value==value.to_ascii_lowercase());
    if identifier(value)&&!value.starts_with("--")&&!reserved{return value.to_string();}
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
    let value=value.trim();
    let tail=if let Some((_,tail))=value.split_once('/') {tail} else {
        let (_,body)=value.split_once('(')?;
        if body.split(',').count()!=4{return None;}
        body.rsplit_once(',')?.1
    };
    let tail=tail.trim().strip_suffix(')')?.trim();
    let a=if tail=="none"{0.0}else if let Some(p)=tail.strip_suffix('%'){number(p.trim())?/100.0}else{number(tail)?};
    a.is_finite().then_some(a.clamp(0.0,1.0))
}

pub fn font(value: &str) -> Option<String> {
    let value=preprocess(value);
    let tokens=font_tokens(&value)?;
    let (mut style,mut variant,mut weight)=(None,None,None);
    for (i,token) in tokens.iter().enumerate(){
        let lower=token.to_ascii_lowercase();
        if i>0&&tokens[i-1].eq_ignore_ascii_case("oblique"){
            if let Some(angle)=angle_degrees(&lower){
                if !(-90.0..=90.0).contains(&angle){return None;}
                style=Some(format!("oblique {}deg",angle));continue;
            }
        }
        let size_token=lower.split('/').next()?;
        let units=[("px",1.0),("pt",96.0/72.0),("pc",16.0),("in",96.0),("cm",96.0/2.54),("mm",96.0/25.4),("q",96.0/101.6)];
        if let Some((number,scale))=units.iter().find_map(|(u,s)|size_token.strip_suffix(u).map(|n|(n,*s))){
            let size=parsed_number(number)?*scale;
            if size<0.0{return None;}
            let size=size.min(10000.0);
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
            let mut chars=family.chars().peekable();
            while let Some(ch)=chars.next(){
                if ch=='\\'{part.push_str(&raw_escape(&mut chars)?);continue;}
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
                    if p.len()<2||!p.ends_with(q){return None;}
                    let mut chars=p[1..p.len()-1].chars().peekable();
                    while let Some(ch)=chars.next(){if ch=='\\'{raw_escape(&mut chars)?;}else if ch==q{return None;}}
                    *part=serialize_family(&family_string(&p[1..p.len()-1])?);
                }else{
                    let names=font_tokens(p)?.iter().map(|token|decoded_identifier(token)).collect::<Option<Vec<_>>>()?;
                    if names.len()==1&&wide_keyword(&names[0]){return None;}
                    if names.len()>1&&generic_family(&names[0]){return None;}
                    let name=names.join(" ");
                    *part=if names.len()==1&&generic_family(&name){name.to_ascii_lowercase()}else{serialize_family(&name)};
                }
            }
            let mut result=Vec::new();
            if let Some(s)=style{result.push(s);}if let Some(w)=weight{result.push(w);}if let Some(v)=variant{result.push(v);}
            result.push(format!("{}px",size));result.push(families.iter().map(|f|f.trim()).collect::<Vec<_>>().join(", "));
            return Some(result.join(" "));
        }
        match lower.as_str(){
            "normal"=>{},
            "italic"|"oblique"=>{if style.is_some(){return None;}style=Some(lower);},
            "small-caps"=>{if variant.is_some(){return None;}variant=Some(lower);},
            "bold"|"bolder"|"lighter"=>{if weight.is_some(){return None;}weight=Some(match lower.as_str(){"bolder"=>"bold".to_string(),"lighter"=>"100".to_string(),_=>lower});},
            _=>{let n=self::number(&lower)?;if !(1.0..=1000.0).contains(&n)||weight.is_some(){return None;}weight=Some((n.trunc() as u32).to_string());}
        }
    }
    None
}

fn angle_degrees(value:&str)->Option<f64>{
    for (unit,scale) in [("deg",1.0),("grad",0.9),("rad",180.0/std::f64::consts::PI),("turn",360.0)]{
        if let Some(n)=value.strip_suffix(unit){return Some(number(n)?*scale);}
    }
    None
}
// Keep the requested slope in internal state even where Blink omits it from
// the public canvas font serialization.
pub fn serialized_font(value:&str)->String{
    if let Some(rest)=value.strip_prefix("oblique "){
        if let Some((angle,tail))=rest.split_once(' '){
            if let Some(angle)=angle_degrees(angle){return if angle==14.0{format!("italic {}",tail)}else{tail.to_string()};}
        }
        return format!("italic {}",rest);
    }
    value.to_string()
}

pub fn hsl_color(value:&str)->Option<[f32;4]>{
    let simple_syntax = !value.contains("/*") && !value.contains('\\');
    let value=preprocess(&value.to_ascii_lowercase());let value=value.trim();
    if !value.starts_with("hsl(")&&!value.starts_with("hsla("){return None;}
    function_color(value)?;
    let body=value.split_once('(')?.1.strip_suffix(')')?;
    let fields=body.split(|c:char|c.is_ascii_whitespace()||c=='/'||c==',').filter(|v|!v.is_empty()).collect::<Vec<_>>();
    let numeric=|s:&str|if s=="none"{Some(0.0)}else{number(s)};
    let hue=if fields[0]=="none"{0.0}else{angle_degrees(fields[0]).or_else(||number(fields[0]))?};
    let h=hue.rem_euclid(360.0) as f32;
    let s=numeric(fields[1].strip_suffix('%').unwrap_or(fields[1]))?.clamp(0.0,100.0) as f32*0.01f32;
    let l=numeric(fields[2].strip_suffix('%').unwrap_or(fields[2]))?.clamp(0.0,100.0) as f32*0.01f32;
    let mut a=if fields.len()==4{if let Some(p)=fields[3].strip_suffix('%'){numeric(p)? as f32*0.01f32}else{numeric(fields[3])? as f32}}else{1.0};
    // Chromium's simple HSL parser quantizes numeric alpha, while percentage
    // alpha goes through the general CSS parser and retains float precision.
    let simple_number=|v:&str| {
        let v=v.strip_prefix('-').unwrap_or(v);
        !v.is_empty() && v.bytes().all(|b|b.is_ascii_digit()||b==b'.')
    };
    let hue_number=["deg","grad","rad","turn"].iter()
        .find_map(|unit|fields[0].strip_suffix(unit)).unwrap_or(fields[0]);
    let simple_percentage=|v:&str|v.strip_suffix('%').is_some_and(|v|
        simple_number(v) && v.trim_start_matches('-').as_bytes().first().is_some_and(u8::is_ascii_digit));
    if simple_syntax && fields.len()==4 && simple_number(hue_number)
        && simple_percentage(fields[1]) && simple_percentage(fields[2])
        && simple_number(fields[3]) && body.as_bytes().last().is_some_and(u8::is_ascii_digit) {
        a=(a.clamp(0.0,1.0)*255.0).round()/255.0;
    }
    let channel=|n:f32|{let k=(n+h/30.0)%12.0;l-s*l.min(1.0-l)*(-1.0f32).max((k-3.0).min(9.0-k).min(1.0))};
    Some([channel(0.0),channel(8.0),channel(4.0),a.clamp(0.0,1.0)])
}

pub fn function_color(value:&str)->Option<[u8;4]>{
    let value=preprocess(value);
    let value=value.trim();
    let (name,body)=value.split_once('(')?;let body=body.strip_suffix(')')?;
    if !["rgb","rgba","hsl","hsla"].contains(&name){return None;}
    let modern=!body.contains(',');
    if modern{
        let parts=body.split('/').collect::<Vec<_>>();
        if parts.len()>2||parts[0].split_whitespace().count()!=3||(parts.len()==2&&parts[1].split_whitespace().count()!=1){return None;}
    }
    let mut fields:Vec<&str>=if modern{body.split(|c:char|c.is_ascii_whitespace()||c=='/').filter(|v|!v.is_empty()).collect()}else{body.split(',').map(str::trim).collect()};
    if fields.len()!=3&&fields.len()!=4{return None;}
    if !modern && name.starts_with("rgb") && fields[..3].iter().any(|s|s.ends_with('%')!=fields[0].ends_with('%')){return None;}
    if modern{for field in &mut fields{if *field=="none"{*field="0";}}}
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

// Canvas spacing accepts CSS lengths, retaining the unit for the getter.
pub fn spacing(value:&str, font_size:f64)->Option<(String,f64)> {
    let value=value.to_ascii_lowercase();
    for (unit,scale) in [("rcap",font_size),("rex",font_size),("rch",font_size),("ric",font_size),("cap",font_size),("ic",font_size),("rlh",0.0),("lh",0.0),("rem",font_size),("ex",font_size),("ch",font_size),("vw",0.0),("vh",0.0),("vmin",0.0),("vmax",0.0),("px",1.0),("pt",96.0/72.0),("pc",16.0),("in",96.0),("cm",96.0/2.54),("mm",96.0/25.4),("q",96.0/101.6),("em",font_size)] {
        if let Some(prefix)=value.strip_suffix(unit) {let n=parsed_number(prefix)?.clamp(-(f32::MAX as f64),f32::MAX as f64) as f32 as f64;return Some((format!("{}{}",if n==0.0{0.0}else{n},unit),n*scale));}
    }
    None
}

pub fn serialized_spacing(value:&str)->String {
    let Some(index)=value.char_indices().find_map(|(i,_)|if i>0 && number(&value[..i]).is_some() && value[i..].chars().all(|c|c.is_ascii_alphabetic()){Some(i)}else{None})else{return value.into();};
    let Ok(n)=value[..index].parse::<f64>()else{return value.into();};
    // Blink serializes the float with six significant decimal digits, while
    // layout retains the original stored value rather than reparsing the getter.
    let n=n as f32;
    if n==0.0{return format!("0{}",&value[index..]);}
    let scientific=format!("{:.5e}",n);
    let (mantissa,exponent)=scientific.split_once('e').unwrap();
    let exponent=exponent.parse::<i32>().unwrap();
    if exponent < -6 || exponent >= 6 {
        return format!("{}e{:+}{}",mantissa,exponent,&value[index..]);
    }
    let digits=(5-exponent).max(0) as usize;
    let formatted=format!("{:.*}",digits,n);
    let formatted=if formatted.contains('.') {formatted.trim_end_matches('0').trim_end_matches('.')}else{&formatted};
    format!("{}{}",formatted,&value[index..])
}

// The font shorthand reflects the current caps property, while the stored
// font retains the independently parsed size, style, weight and family.
pub fn serialized_font_caps(value:&str,caps:&str)->String {
    let value=serialized_font(value);
    let mut prefix=Vec::new();
    let mut offset=0;
    for token in value.split_whitespace() {
        if token.ends_with("px") { break; }
        if token!="small-caps" {prefix.push(token);}
        offset+=token.len()+1;
    }
    if caps=="small-caps" {prefix.push("small-caps");}
    prefix.push(&value[offset..]);
    prefix.join(" ")
}

// CSS named-color RGB values, including grey aliases and rebeccapurple.
pub fn named_color(value:&str)->Option<[u8;4]>{
    let rgb=match value {
        "aliceblue" => [240, 248, 255],
        "antiquewhite" => [250, 235, 215],
        "aqua" => [0, 255, 255],
        "aquamarine" => [127, 255, 212],
        "azure" => [240, 255, 255],
        "beige" => [245, 245, 220],
        "bisque" => [255, 228, 196],
        "black" => [0, 0, 0],
        "blanchedalmond" => [255, 235, 205],
        "blue" => [0, 0, 255],
        "blueviolet" => [138, 43, 226],
        "brown" => [165, 42, 42],
        "burlywood" => [222, 184, 135],
        "cadetblue" => [95, 158, 160],
        "chartreuse" => [127, 255, 0],
        "chocolate" => [210, 105, 30],
        "coral" => [255, 127, 80],
        "cornflowerblue" => [100, 149, 237],
        "cornsilk" => [255, 248, 220],
        "crimson" => [220, 20, 60],
        "cyan" => [0, 255, 255],
        "darkblue" => [0, 0, 139],
        "darkcyan" => [0, 139, 139],
        "darkgoldenrod" => [184, 134, 11],
        "darkgray" => [169, 169, 169],
        "darkgreen" => [0, 100, 0],
        "darkgrey" => [169, 169, 169],
        "darkkhaki" => [189, 183, 107],
        "darkmagenta" => [139, 0, 139],
        "darkolivegreen" => [85, 107, 47],
        "darkorange" => [255, 140, 0],
        "darkorchid" => [153, 50, 204],
        "darkred" => [139, 0, 0],
        "darksalmon" => [233, 150, 122],
        "darkseagreen" => [143, 188, 143],
        "darkslateblue" => [72, 61, 139],
        "darkslategray" => [47, 79, 79],
        "darkslategrey" => [47, 79, 79],
        "darkturquoise" => [0, 206, 209],
        "darkviolet" => [148, 0, 211],
        "deeppink" => [255, 20, 147],
        "deepskyblue" => [0, 191, 255],
        "dimgray" => [105, 105, 105],
        "dimgrey" => [105, 105, 105],
        "dodgerblue" => [30, 144, 255],
        "firebrick" => [178, 34, 34],
        "floralwhite" => [255, 250, 240],
        "forestgreen" => [34, 139, 34],
        "fuchsia" => [255, 0, 255],
        "gainsboro" => [220, 220, 220],
        "ghostwhite" => [248, 248, 255],
        "gold" => [255, 215, 0],
        "goldenrod" => [218, 165, 32],
        "gray" => [128, 128, 128],
        "green" => [0, 128, 0],
        "greenyellow" => [173, 255, 47],
        "grey" => [128, 128, 128],
        "honeydew" => [240, 255, 240],
        "hotpink" => [255, 105, 180],
        "indianred" => [205, 92, 92],
        "indigo" => [75, 0, 130],
        "ivory" => [255, 255, 240],
        "khaki" => [240, 230, 140],
        "lavender" => [230, 230, 250],
        "lavenderblush" => [255, 240, 245],
        "lawngreen" => [124, 252, 0],
        "lemonchiffon" => [255, 250, 205],
        "lightblue" => [173, 216, 230],
        "lightcoral" => [240, 128, 128],
        "lightcyan" => [224, 255, 255],
        "lightgoldenrodyellow" => [250, 250, 210],
        "lightgray" => [211, 211, 211],
        "lightgreen" => [144, 238, 144],
        "lightgrey" => [211, 211, 211],
        "lightpink" => [255, 182, 193],
        "lightsalmon" => [255, 160, 122],
        "lightseagreen" => [32, 178, 170],
        "lightskyblue" => [135, 206, 250],
        "lightslategray" => [119, 136, 153],
        "lightslategrey" => [119, 136, 153],
        "lightsteelblue" => [176, 196, 222],
        "lightyellow" => [255, 255, 224],
        "lime" => [0, 255, 0],
        "limegreen" => [50, 205, 50],
        "linen" => [250, 240, 230],
        "magenta" => [255, 0, 255],
        "maroon" => [128, 0, 0],
        "mediumaquamarine" => [102, 205, 170],
        "mediumblue" => [0, 0, 205],
        "mediumorchid" => [186, 85, 211],
        "mediumpurple" => [147, 112, 219],
        "mediumseagreen" => [60, 179, 113],
        "mediumslateblue" => [123, 104, 238],
        "mediumspringgreen" => [0, 250, 154],
        "mediumturquoise" => [72, 209, 204],
        "mediumvioletred" => [199, 21, 133],
        "midnightblue" => [25, 25, 112],
        "mintcream" => [245, 255, 250],
        "mistyrose" => [255, 228, 225],
        "moccasin" => [255, 228, 181],
        "navajowhite" => [255, 222, 173],
        "navy" => [0, 0, 128],
        "oldlace" => [253, 245, 230],
        "olive" => [128, 128, 0],
        "olivedrab" => [107, 142, 35],
        "orange" => [255, 165, 0],
        "orangered" => [255, 69, 0],
        "orchid" => [218, 112, 214],
        "palegoldenrod" => [238, 232, 170],
        "palegreen" => [152, 251, 152],
        "paleturquoise" => [175, 238, 238],
        "palevioletred" => [219, 112, 147],
        "papayawhip" => [255, 239, 213],
        "peachpuff" => [255, 218, 185],
        "peru" => [205, 133, 63],
        "pink" => [255, 192, 203],
        "plum" => [221, 160, 221],
        "powderblue" => [176, 224, 230],
        "purple" => [128, 0, 128],
        "rebeccapurple" => [102, 51, 153],
        "red" => [255, 0, 0],
        "rosybrown" => [188, 143, 143],
        "royalblue" => [65, 105, 225],
        "saddlebrown" => [139, 69, 19],
        "salmon" => [250, 128, 114],
        "sandybrown" => [244, 164, 96],
        "seagreen" => [46, 139, 87],
        "seashell" => [255, 245, 238],
        "sienna" => [160, 82, 45],
        "silver" => [192, 192, 192],
        "skyblue" => [135, 206, 235],
        "slateblue" => [106, 90, 205],
        "slategray" => [112, 128, 144],
        "slategrey" => [112, 128, 144],
        "snow" => [255, 250, 250],
        "springgreen" => [0, 255, 127],
        "steelblue" => [70, 130, 180],
        "tan" => [210, 180, 140],
        "teal" => [0, 128, 128],
        "thistle" => [216, 191, 216],
        "tomato" => [255, 99, 71],
        "turquoise" => [64, 224, 208],
        "violet" => [238, 130, 238],
        "wheat" => [245, 222, 179],
        "white" => [255, 255, 255],
        "whitesmoke" => [245, 245, 245],
        "yellow" => [255, 255, 0],
        "yellowgreen" => [154, 205, 50],
        "transparent" => return Some([0,0,0,0]),
        _ => return None,
    };
    Some([rgb[0],rgb[1],rgb[2],255])
}
