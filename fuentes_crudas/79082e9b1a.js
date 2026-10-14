function certifica(sitio_id,area_id,pagina_id){
   path='/' + area_id + '/' + pagina_id;
   certifica_path(sitio_id, path);
}

function certifica_path(sitio_id, path)
{
   // Conversión de parámetros de entrada
   var sitio_aux="no_definido";

   if(sitio_id==10429){sitio_aux="sii";}
   if(sitio_id==14446){sitio_aux="bbrr-prod";}
   if(sitio_id==15442){sitio_aux="intranet";}
   if(sitio_id==14444){sitio_aux="iva-prod";}
   if(sitio_id==15444){sitio_aux="planeta-sii";}
   if(sitio_id==14441){sitio_aux="renta-prod";}
   if(sitio_id==15443){sitio_aux="sii-educa";}
   if(sitio_id==14447){sitio_aux="dii";}
   if(sitio_id==14484){sitio_aux="dtep";}
   if(sitio_id==14449){sitio_aux="movil";}

   path_aux = path.substr(1);
   path_aux = path_aux.replace(/\//g, ".");
	
   // Inserción dentro del tag de <certifica_links> u otros, de la llamaba al código Adobe Analytics
   var jsPars = document.createElement("script");
   jsPars.text = "digitalData = {pageInstanceID: '"+path_aux+"', page: {pageInfo: {pageID: '"+sitio_aux+"',}}}";

   div_certifica = document.getElementById('certifica_links');
   if (div_certifica==null) {div_certifica = document.getElementById('certifica');}
   if (div_certifica==null) {div_certifica = document.getElementById('dax');}
   if (div_certifica==null) {div_certifica = document.getElementById('contenedor');}
   if (div_certifica==null) {div_certifica = document.getElementById('container');}

   if (div_certifica!=null) 
   {
      if ((typeof swRegVisitas == 'undefined')||(swRegVisitas == 0)){
         swRegVisitas = 1;
         var js = document.createElement("script");
         js.src = "//assets.adobedtm.com/launch-EN2b1e36bbb6d548dfa15c1b55cb71b120.min.js";
         div_certifica.appendChild(js);
      }
      div_certifica.appendChild(jsPars);
   }else{
      if ((typeof swRegVisitas == 'undefined')||(swRegVisitas == 0)){
         swRegVisitas = 1;
         document.write("<script src='//assets.adobedtm.com/launch-EN2b1e36bbb6d548dfa15c1b55cb71b120.min.js'></script>\n");
		}
      document.body.appendChild(jsPars);
	}
}
