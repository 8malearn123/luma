/* <image-slot> — خانة صورة قابلة للرفع تُستخدم في وثيقة الباقات وغيرها.
   بدون صورة: إطار متقطع بنص إرشادي. بالنقر: اختيار صورة تُعرض وتُحفظ
   في المتصفح (حسب الـ id) فتبقى بعد إعادة الفتح. */
(function(){
  if(customElements.get('image-slot'))return;
  const KEY=id=>'luma_imgslot_'+id;
  class ImageSlot extends HTMLElement{
    connectedCallback(){
      this.style.cssText+=';position:relative;overflow:hidden;border-radius:14px;cursor:pointer;background:var(--is-bg,#0d0b0a);';
      const saved=this.id?localStorage.getItem(KEY(this.id)):null;
      saved?this.show(saved):this.empty();
      this.addEventListener('click',()=>this.pick());
    }
    empty(){
      this.innerHTML=`<div style="position:absolute;inset:10px;border:1.5px dashed rgba(156,124,58,.55);border-radius:11px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center;padding:14px">
        <span style="font-size:26px;opacity:.7">🖼️</span>
        <span style="font-size:12.5px;color:#9c8047;line-height:1.8">${this.getAttribute('placeholder')||'أضيفي صورة هنا'}</span>
        <span style="font-size:10px;color:#58545f">اضغطي للرفع</span></div>`;
    }
    show(src){
      const fit=this.getAttribute('fit')||'cover';
      this.innerHTML=`<img src="${src}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit}"/>`;
    }
    pick(){
      const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
      inp.onchange=()=>{
        const f=inp.files&&inp.files[0];if(!f)return;
        const rd=new FileReader();
        rd.onload=()=>{const im=new Image();im.onload=()=>{
          const MAX=1200,sc=Math.min(1,MAX/Math.max(im.width,im.height));
          const cv=document.createElement('canvas');cv.width=im.width*sc;cv.height=im.height*sc;
          cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
          const url=cv.toDataURL('image/jpeg',0.78);
          if(this.id)try{localStorage.setItem(KEY(this.id),url)}catch(e){}
          this.show(url);
        };im.src=rd.result;};
        rd.readAsDataURL(f);
      };
      inp.click();
    }
  }
  customElements.define('image-slot',ImageSlot);
})();
